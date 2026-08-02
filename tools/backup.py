"""UTOP 백업 — PostgreSQL 전체 덤프 + data/ 폴더 압축.

정책:
  - 저장 경로는 환경변수 UTOP_BACKUP_DIR 로 반드시 지정. 기본값을 저장소 안으로 두지 않는다.
  - 비번은 subprocess 환경변수로만 pg_dump 에 전달 (명령줄 인자 금지).
  - 출력·에러 로그는 비번을 ***** 로 치환하는 마스킹 함수를 거친다.
  - 저장 경로가 OneDrive/Dropbox/GoogleDrive 같은 동기화 폴더로 보이면 경고 + 확인.
  - 최근 N개(기본 14, UTOP_BACKUP_KEEP 로 조정)만 보존. 그 외는 목록 출력 후 삭제.

사용법:
  python tools/backup.py                # UTOP_BACKUP_DIR 로 백업
  python tools/backup.py --yes          # 동기화 폴더 경고 자동 확인
  python tools/backup.py --keep 30      # 보존 개수 지정
"""
from __future__ import annotations
import argparse
import os
import re
import shutil
import subprocess
import sys
import time
import zipfile
from datetime import datetime
from pathlib import Path

# UTF-8 강제 (Windows cp949 회피)
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
DATA_DIR = ROOT / "data"

# .env 로드 — 두 위치를 모두 순회 (backend/.env 가 있어도 PG 값이 없을 수 있음).
# override=False 라 이미 로드된 값은 덮지 않고, 새 값만 채움.
sys.path.insert(0, str(BACKEND))
try:
    from dotenv import load_dotenv  # type: ignore
    for _p in [BACKEND / ".env", ROOT / ".env"]:
        if _p.exists():
            load_dotenv(_p, override=False)
except Exception:
    pass


# ─── PG 접속 정보 ────────────────────────────────────────────────
def _pg_env() -> dict[str, str]:
    """.env / 환경변수에서 PG 접속 정보 취합. 값이 없으면 backend/db.py 의 폴백 사용."""
    # DATABASE_URL 파싱해서 각 요소 추출 (있으면 우선)
    url = os.environ.get("DATABASE_URL", "").strip()
    host = os.environ.get("PGHOST", "").strip()
    port = os.environ.get("PGPORT", "").strip()
    user = os.environ.get("PGUSER", "").strip()
    pw   = os.environ.get("PGPASSWORD", "").strip()
    db   = os.environ.get("PGDATABASE", "").strip()

    if url and not (host and port and user and pw and db):
        # postgresql://user:pw@host:port/db
        m = re.match(r"^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)", url)
        if m:
            user = user or m.group(1)
            pw   = pw   or m.group(2)
            host = host or m.group(3)
            port = port or m.group(4)
            db   = db   or m.group(5)

    # 최종 폴백 (backend/db.py 기본값과 동일)
    host = host or "localhost"
    port = port or "5433"
    user = user or "utop"
    db   = db   or "utop"
    if not pw:
        print("[backup] ERROR: PG 비번을 찾을 수 없습니다. .env 의 PGPASSWORD 또는 DATABASE_URL 을 설정하세요.", file=sys.stderr)
        sys.exit(1)
    return {"PGHOST": host, "PGPORT": port, "PGUSER": user, "PGDATABASE": db, "PGPASSWORD": pw}


def _mask(text: str, pw: str) -> str:
    """모든 로그 출력 전에 비번을 마스킹."""
    if not text or not pw:
        return text
    return text.replace(pw, "*****")


# ─── pg_dump 위치 탐색 ────────────────────────────────────────────
_PG_STD_DIRS = [
    r"C:\Program Files\PostgreSQL\17\bin",
    r"C:\Program Files\PostgreSQL\16\bin",
    r"C:\Program Files\PostgreSQL\15\bin",
    r"C:\Program Files (x86)\PostgreSQL\17\bin",
]

def _find_pg_dump() -> str:
    p = shutil.which("pg_dump") or shutil.which("pg_dump.exe")
    if p:
        return p
    for d in _PG_STD_DIRS:
        cand = Path(d) / ("pg_dump.exe" if os.name == "nt" else "pg_dump")
        if cand.exists():
            return str(cand)
    print("[backup] ERROR: pg_dump 를 찾을 수 없습니다. PostgreSQL 클라이언트를 설치하고 PATH 에 추가하세요.", file=sys.stderr)
    sys.exit(1)


# ─── 저장 경로 검증 ────────────────────────────────────────────────
_SYNC_HINTS = ("onedrive", "dropbox", "google drive", "googledrive", "iclouddrive", "box sync", "pcloud")

def _looks_synced(path: Path) -> bool:
    s = str(path).lower()
    return any(h in s for h in _SYNC_HINTS)


def _resolve_backup_dir(auto_yes: bool) -> Path:
    raw = os.environ.get("UTOP_BACKUP_DIR", "").strip()
    if not raw:
        print("[backup] ERROR: 환경변수 UTOP_BACKUP_DIR 이 설정되지 않았습니다.", file=sys.stderr)
        print("        예: powershell> $env:UTOP_BACKUP_DIR = 'C:\\utop_backups'", file=sys.stderr)
        sys.exit(1)
    p = Path(raw)
    # 저장소 안이면 거부
    try:
        p.resolve().relative_to(ROOT.resolve())
        print(f"[backup] ERROR: UTOP_BACKUP_DIR 이 저장소 안입니다: {p}", file=sys.stderr)
        print("        저장소 밖 경로로 지정하세요.", file=sys.stderr)
        sys.exit(1)
    except ValueError:
        pass  # 저장소 밖 — 정상
    p.mkdir(parents=True, exist_ok=True)
    if _looks_synced(p):
        print(f"[backup] ⚠️  경고: 저장 경로가 클라우드 동기화 폴더로 보입니다: {p}", file=sys.stderr)
        print("         백업에는 장비 평문 비번·API 키가 포함됩니다. 클라우드에 올라가도 괜찮은지 확인하세요.", file=sys.stderr)
        if not auto_yes:
            ans = input("        계속하려면 'yes' 입력: ").strip().lower()
            if ans != "yes":
                print("[backup] 사용자 취소.", file=sys.stderr)
                sys.exit(1)
    return p


# ─── 실제 백업 ─────────────────────────────────────────────────────
def _pg_dump(pg_env: dict[str, str], out_path: Path, pg_dump_bin: str) -> None:
    pw = pg_env["PGPASSWORD"]
    # 명령줄에는 비번 절대 안 넣음. PGPASSWORD 는 env 로만.
    cmd = [
        pg_dump_bin,
        "-h", pg_env["PGHOST"],
        "-p", pg_env["PGPORT"],
        "-U", pg_env["PGUSER"],
        "-d", pg_env["PGDATABASE"],
        "-Fc",                      # 압축 커스텀 포맷
        "-f", str(out_path),
    ]
    env = os.environ.copy()
    env["PGPASSWORD"] = pw
    print(f"[backup] pg_dump 실행: {pg_env['PGUSER']}@{pg_env['PGHOST']}:{pg_env['PGPORT']}/{pg_env['PGDATABASE']}")
    r = subprocess.run(cmd, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        # 비번 마스킹 후 stderr 출력
        print("[backup] ERROR: pg_dump 실패", file=sys.stderr)
        if r.stderr.strip():
            print(_mask(r.stderr.rstrip(), pw), file=sys.stderr)
        # 부분 파일 정리
        out_path.unlink(missing_ok=True)
        sys.exit(1)


def _zip_data(out_path: Path) -> None:
    """data/ 전체를 zip 으로 압축. gitignore 무관하게 존재하는 모든 파일 포함."""
    print(f"[backup] data/ 압축 → {out_path.name}")
    file_count = 0
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in DATA_DIR.rglob("*"):
            if p.is_file():
                arc = p.relative_to(ROOT)  # data/... 형식으로 저장
                try:
                    zf.write(p, arc)
                    file_count += 1
                except (PermissionError, OSError) as e:
                    print(f"[backup]   skip {arc}: {e}", file=sys.stderr)
    print(f"[backup]   {file_count} files zipped")


# ─── 보존 ─────────────────────────────────────────────────────────
def _prune(backup_dir: Path, keep: int) -> None:
    dumps = sorted(backup_dir.glob("utop-backup-*.dump"), key=lambda p: p.stat().st_mtime, reverse=True)
    zips  = sorted(backup_dir.glob("utop-backup-*.zip"),  key=lambda p: p.stat().st_mtime, reverse=True)
    to_del: list[Path] = []
    for lst in (dumps, zips):
        if len(lst) > keep:
            to_del.extend(lst[keep:])
    if not to_del:
        return
    print(f"[backup] 보존 정책({keep}개 유지) 초과: {len(to_del)}개 삭제 예정")
    for p in to_del:
        sz = p.stat().st_size
        print(f"  - {p.name} ({sz//1024} KB)")
        try:
            p.unlink()
        except OSError as e:
            print(f"    삭제 실패: {e}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="동기화 폴더 경고 자동 확인")
    ap.add_argument("--keep", type=int,
                    default=int(os.environ.get("UTOP_BACKUP_KEEP", "14")),
                    help="보존 개수 (기본 14 또는 UTOP_BACKUP_KEEP)")
    args = ap.parse_args()

    backup_dir = _resolve_backup_dir(args.yes)
    pg_env = _pg_env()
    pg_dump_bin = _find_pg_dump()

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dump_path = backup_dir / f"utop-backup-{ts}.dump"
    zip_path  = backup_dir / f"utop-backup-{ts}.zip"

    print(f"[backup] 저장 경로: {backup_dir}")
    print(f"[backup] pg_dump : {pg_dump_bin}")
    print()

    t0 = time.time()
    _pg_dump(pg_env, dump_path, pg_dump_bin)
    t1 = time.time()
    _zip_data(zip_path)
    t2 = time.time()

    dump_kb = dump_path.stat().st_size // 1024
    zip_kb  = zip_path.stat().st_size // 1024

    print()
    print("[backup] ✅ 완료")
    print(f"  {dump_path}  ({dump_kb:,} KB, {t1-t0:.1f}s)")
    print(f"  {zip_path}  ({zip_kb:,} KB, {t2-t1:.1f}s)")
    print()

    _prune(backup_dir, args.keep)
    return 0


if __name__ == "__main__":
    sys.exit(main())
