# 백업 · 복원

`tools/backup.py` — PostgreSQL 전체 덤프 + `data/` 폴더 압축.
`tools/restore.py` — 지정한 대상 DB 로 복원 (운영 DB 보호 안전장치 포함).

## ⚠️ 경고

**백업 파일에는 다음 민감 정보가 포함된다:**
- `data/devices/devices.json` — 장비 SSH/Telnet 계정 평문 비밀번호 137대
- `data/integrations/llms.json` / `jira.json` / `confluence_config.json` — API 키·토큰·비번
- `data/backups/device_catalog/` — 장비 카탈로그 자동 백업 (평문 비번)
- PostgreSQL `app_kv` 안 `users` 키 — 사용자 계정 SHA256 해시

**클라우드 동기화 폴더(OneDrive/Dropbox/GoogleDrive)에 저장 금지.** 스크립트가 경로에서 감지 시 경고하고 확인을 요구한다.

## 저장 경로 정책

- 환경변수 `UTOP_BACKUP_DIR` 로 지정한다. 기본값 없음. 미설정 시 스크립트는 exit 1.
- **저장소 안 경로는 거부**된다 (git commit 위험 회피).
- 예: `[Environment]::SetEnvironmentVariable("UTOP_BACKUP_DIR", "C:\utop_backups", "User")`

## 실행 방법

### 백업

```powershell
python tools/backup.py                # 기본
python tools/backup.py --yes          # 동기화 폴더 경고 자동 확인
python tools/backup.py --keep 30      # 최근 30개만 유지 (기본 14)
```

산출물 두 파일이 `UTOP_BACKUP_DIR` 에 생성됨:
- `utop-backup-YYYYMMDD-HHMMSS.dump` — PostgreSQL 커스텀 포맷 (pg_dump -Fc)
- `utop-backup-YYYYMMDD-HHMMSS.zip` — `data/` 폴더 전체 (gitignore 대상 포함)

보존 정책: `UTOP_BACKUP_KEEP` (기본 14) 초과분은 실행 시 삭제. 삭제 전 목록 출력.

### 복원

**절대 운영 DB 로 바로 복원하지 말 것.** `--target-db` 필수, 기본값 없음.

```powershell
# 1. 대상 DB 를 미리 생성 (스크립트가 CREATE DATABASE 안 함)
$env:PGPASSWORD = Read-Host "utop 비번"
& "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -h localhost -p 5433 -U utop utop_restore_test

# 2. 복원
python tools/restore.py C:\utop_backups\utop-backup-20260728-203045.dump `
    --target-db utop_restore_test

# 3. 검증 후 삭제
& "C:\Program Files\PostgreSQL\17\bin\dropdb.exe" -h localhost -p 5433 -U utop utop_restore_test
```

`--with-data` 로 `data/` 도 함께 복원 가능 (저장소 밖 경로 필수):

```powershell
python tools/restore.py <dump> --target-db <db> `
    --with-data C:\utop_backups\utop-backup-20260728-203045.zip `
    --data-target C:\utop_restore_data
```

## 안전장치

`restore.py` 는 세 가지 사전 검증:

1. **운영 DB 보호**: `--target-db` 가 `.env` 의 `PGDATABASE` 와 같으면 즉시 중단
2. **DB 존재 확인**: 대상 DB 가 없으면 안내 후 중단 (`createdb` 명령 제시)
3. **빈 DB 확인**: 대상 DB 에 public 스키마 테이블이 하나라도 있으면 중단 (`--force` 없이는)

`--force` 는 `--clean --if-exists` 로 기존 테이블을 덮어쓴다. 위험한 옵션이므로 명시적으로 지정한 경우만 동작.

## 비번 취급

- `pg_dump` / `pg_restore` 에 비번은 **subprocess 환경변수 `PGPASSWORD`** 로만 전달. 명령줄 인자 금지.
- 실패 시 stderr 출력 전에 **비번 문자열을 `*****` 로 마스킹**한다.
- `.env` 의 값을 읽어 씀. `backend/db.py` 와 동일한 출처.

## Windows 작업 스케줄러 등록

관리자 PowerShell 에서:

```powershell
$action  = New-ScheduledTaskAction -Execute "C:\utop\.venv\Scripts\python.exe" `
             -Argument "C:\utop\tools\backup.py --yes" `
             -WorkingDirectory "C:\utop"
$trigger = New-ScheduledTaskTrigger -Daily -At "3:00 AM"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName "UTOP Backup" -Action $action -Trigger $trigger `
    -Settings $settings -Description "UTOP DB + data 자동 백업"
```

주의:
- 스케줄러 작업이 실행되는 사용자 계정에도 `UTOP_BACKUP_DIR` 환경변수가 설정돼 있어야 한다 (`[Environment]::SetEnvironmentVariable(..., "User")` 로 등록했으면 OK, 다른 계정으로 실행 시엔 `"Machine"` 으로).
- `PGPASSWORD` 는 `.env` 에서 읽으므로 별도 등록 불필요.

## 실측 시간 (참고)

- pg_dump (~2.6 MB dump): 0.8초
- data/ 압축 (~858 파일, ~27 MB zip): 30초 안팎
- 복원 (pg_restore, 빈 DB → 전체): 5초 안팎

## 검증 이력

2026-07-28 세션에서 다음 확인:
- 원본 vs `utop_restore_test` 7개 테이블 (tc/cycle/req/manuals/app_kv/sessions/rag_embed) 행 수 완전 일치
- 안전장치 3가지 (운영 DB 이름 차단 · 이미 테이블 있는 DB 차단 · 저장소 안 경로 거부) 모두 동작
