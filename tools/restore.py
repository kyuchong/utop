r"""UTOP 복원 — 백업 파일(*.dump)을 지정한 DB 로 복원.

안전장치:
  - --target-db 필수. 기본값 없음.
  - --target-db 가 .env 의 PGDATABASE (운영 DB) 와 같으면 무조건 중단.
  - 대상 DB 는 미리 존재해야 함 (스크립트는 CREATE DATABASE 안 함).
  - 대상 DB 에 테이블이 하나라도 있으면 중단 (--force 없이는).
  - --with-data: 백업 zip 을 함께 지정하면 data/ 로 압축 해제.

사용법:
  # 사용자가 미리 만든 utop_restore_test 로 복원 (기본)
  python tools/restore.py C:\utop_backups\utop-backup-20260728-101010.dump \
      --target-db utop_restore_test
  # data/ 도 복원
  python tools/restore.py <dump> --target-db <db> \
      --with-data C:\utop_backups\utop-backup-20260728-101010.zip \
      --data-target C:\some\place\to\extract
"""
from __future__ import annotations
import argparse
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))
try:
    from dotenv import load_dotenv  # type: ignore
    for _p in [BACKEND / ".env", ROOT / ".env"]:
        if _p.exists():
            load_dotenv(_p, override=False)
except Exception:
    pass


def _pg_env(override_db: str | None = None) -> dict[str, str]:
    url = os.environ.get("DATABASE_URL", "").strip()
    host = os.environ.get("PGHOST", "").strip()
    port = os.environ.get("PGPORT", "").strip()
    user = os.environ.get("PGUSER", "").strip()
    pw   = os.environ.get("PGPASSWORD", "").strip()
    db   = os.environ.get("PGDATABASE", "").strip()

    if url:
        m = re.match(r"^postgres(?:ql)?://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)", url)
        if m:
            user = user or m.group(1)
            pw   = pw   or m.group(2)
            host = host or m.group(3)
            port = port or m.group(4)
            db   = db   or m.group(5)

    host = host or "localhost"
    port = port or "5433"
    user = user or "utop"
    db   = db   or "utop"
    if not pw:
        print("[restore] ERROR: PG 비번을 찾을 수 없습니다.", file=sys.stderr)
        sys.exit(1)
    return {"PGHOST": host, "PGPORT": port, "PGUSER": user,
            "PGDATABASE": override_db or db, "PGPASSWORD": pw,
            "_PROD_DB": db}


def _mask(text: str, pw: str) -> str:
    if not text or not pw:
        return text
    return text.replace(pw, "*****")


_PG_STD_DIRS = [
    r"C:\Program Files\PostgreSQL\17\bin",
    r"C:\Program Files\PostgreSQL\16\bin",
    r"C:\Program Files\PostgreSQL\15\bin",
    r"C:\Program Files (x86)\PostgreSQL\17\bin",
]

def _find_bin(name: str) -> str:
    exe = name + (".exe" if os.name == "nt" else "")
    p = shutil.which(name) or shutil.which(exe)
    if p:
        return p
    for d in _PG_STD_DIRS:
        cand = Path(d) / exe
        if cand.exists():
            return str(cand)
    print(f"[restore] ERROR: {name} 를 찾을 수 없습니다.", file=sys.stderr)
    sys.exit(1)


def _run(cmd: list[str], env: dict[str, str], pw: str, ok_msg: str) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"[restore] ERROR: {ok_msg} 실패", file=sys.stderr)
        if r.stderr.strip():
            print(_mask(r.stderr.rstrip(), pw), file=sys.stderr)
        sys.exit(1)
    return r


def _check_target_db_exists(pg_env: dict[str, str], psql_bin: str) -> None:
    """대상 DB 가 이미 존재하는지 확인. 없으면 안내 후 중단."""
    pw = pg_env["PGPASSWORD"]
    env = os.environ.copy()
    env["PGPASSWORD"] = pw
    r = subprocess.run(
        [psql_bin, "-h", pg_env["PGHOST"], "-p", pg_env["PGPORT"],
         "-U", pg_env["PGUSER"], "-d", "postgres",
         "-tAc", f"SELECT 1 FROM pg_database WHERE datname='{pg_env['PGDATABASE']}'"],
        env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        print("[restore] ERROR: 대상 DB 존재 확인 실패", file=sys.stderr)
        if r.stderr.strip():
            print(_mask(r.stderr.rstrip(), pw), file=sys.stderr)
        sys.exit(1)
    if r.stdout.strip() != "1":
        print(f"[restore] ERROR: 대상 DB '{pg_env['PGDATABASE']}' 가 존재하지 않습니다.", file=sys.stderr)
        print(f"        미리 생성하세요: createdb -h {pg_env['PGHOST']} -p {pg_env['PGPORT']} -U {pg_env['PGUSER']} {pg_env['PGDATABASE']}", file=sys.stderr)
        sys.exit(1)


def _check_target_db_empty(pg_env: dict[str, str], psql_bin: str, force: bool) -> None:
    """대상 DB 에 public 스키마 테이블이 있으면 중단(--force 제외)."""
    pw = pg_env["PGPASSWORD"]
    env = os.environ.copy()
    env["PGPASSWORD"] = pw
    r = subprocess.run(
        [psql_bin, "-h", pg_env["PGHOST"], "-p", pg_env["PGPORT"],
         "-U", pg_env["PGUSER"], "-d", pg_env["PGDATABASE"],
         "-tAc", "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"],
        env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    if r.returncode != 0:
        print("[restore] ERROR: 대상 DB 접속 실패", file=sys.stderr)
        if r.stderr.strip():
            print(_mask(r.stderr.rstrip(), pw), file=sys.stderr)
        sys.exit(1)
    n = int(r.stdout.strip() or "0")
    if n > 0 and not force:
        print(f"[restore] ERROR: 대상 DB '{pg_env['PGDATABASE']}' 에 이미 {n} 개 테이블이 있습니다.", file=sys.stderr)
        print("        빈 DB 로 복원하거나 --force 로 진행하세요 (--force 는 --clean --if-exists 로 덮어씀).", file=sys.stderr)
        sys.exit(1)


def _pg_restore(pg_env: dict[str, str], dump_path: Path, pg_restore_bin: str, force: bool) -> None:
    pw = pg_env["PGPASSWORD"]
    cmd = [
        pg_restore_bin,
        "-h", pg_env["PGHOST"],
        "-p", pg_env["PGPORT"],
        "-U", pg_env["PGUSER"],
        "-d", pg_env["PGDATABASE"],
        "--no-owner", "--no-privileges",
    ]
    if force:
        cmd.extend(["--clean", "--if-exists"])
    cmd.append(str(dump_path))
    env = os.environ.copy()
    env["PGPASSWORD"] = pw
    print(f"[restore] pg_restore 실행: {dump_path.name} → {pg_env['PGUSER']}@{pg_env['PGHOST']}:{pg_env['PGPORT']}/{pg_env['PGDATABASE']}")
    r = subprocess.run(cmd, env=env, capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    # pg_restore 는 warning 이 있어도 rc=1 을 낼 수 있으므로 stderr 확인
    if r.stderr.strip():
        # ERROR / FATAL 만 필터해서 표시 (warning 은 요약)
        errors = [ln for ln in r.stderr.split("\n") if "ERROR" in ln or "FATAL" in ln]
        if errors:
            print("[restore] pg_restore stderr (errors only):", file=sys.stderr)
            for ln in errors[:10]:
                print(f"  {_mask(ln, pw)}", file=sys.stderr)
            if len(errors) > 10:
                print(f"  ... 외 {len(errors)-10}건", file=sys.stderr)
    if r.returncode != 0:
        # 에러 없이 rc!=0 이면 warning 만 있는 경우 — 통과 처리
        if not any("ERROR" in ln or "FATAL" in ln for ln in r.stderr.split("\n")):
            print(f"[restore] pg_restore 완료 (warning rc={r.returncode})")
        else:
            print(f"[restore] ERROR: pg_restore 실패 (rc={r.returncode})", file=sys.stderr)
            sys.exit(1)


def _extract_data(zip_path: Path, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    print(f"[restore] data 압축 해제: {zip_path.name} → {target}")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(target)
    print("[restore]   완료")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("dump", type=Path, help="pg_dump 백업 파일 (.dump)")
    ap.add_argument("--target-db", required=True, help="복원 대상 DB 이름 (미리 존재해야 함)")
    ap.add_argument("--force", action="store_true",
                    help="대상 DB 에 테이블이 있어도 --clean --if-exists 로 덮어씀 (위험)")
    ap.add_argument("--with-data", type=Path, default=None,
                    help="data/ 압축 파일 (.zip) — 지정 시 --data-target 필수")
    ap.add_argument("--data-target", type=Path, default=None,
                    help="--with-data 로 압축 해제할 경로 (저장소 안 금지)")
    args = ap.parse_args()

    if not args.dump.exists():
        print(f"[restore] ERROR: 백업 파일 없음: {args.dump}", file=sys.stderr)
        return 1

    pg_env = _pg_env(override_db=args.target_db)
    prod_db = pg_env.pop("_PROD_DB")

    # 안전장치 1: 운영 DB 와 같으면 중단
    if args.target_db == prod_db:
        print(f"[restore] ERROR: 대상 DB '{args.target_db}' 가 운영 DB (.env PGDATABASE) 와 같습니다. 중단.",
              file=sys.stderr)
        return 1

    psql_bin        = _find_bin("psql")
    pg_restore_bin  = _find_bin("pg_restore")

    # 안전장치 2: 대상 DB 존재 확인
    _check_target_db_exists(pg_env, psql_bin)
    # 안전장치 3: 빈 DB 인지 확인
    _check_target_db_empty(pg_env, psql_bin, args.force)

    _pg_restore(pg_env, args.dump, pg_restore_bin, args.force)

    # 옵션: data/ 복원
    if args.with_data:
        if not args.with_data.exists():
            print(f"[restore] ERROR: --with-data 파일 없음: {args.with_data}", file=sys.stderr)
            return 1
        if not args.data_target:
            print("[restore] ERROR: --with-data 사용 시 --data-target 필수", file=sys.stderr)
            return 1
        # 저장소 안이면 거부
        try:
            args.data_target.resolve().relative_to(ROOT.resolve())
            print(f"[restore] ERROR: --data-target 이 저장소 안입니다: {args.data_target}", file=sys.stderr)
            return 1
        except ValueError:
            pass
        _extract_data(args.with_data, args.data_target)

    print()
    print(f"[restore] ✅ 복원 완료: {pg_env['PGDATABASE']}")
    print("        검증: psql 로 접속해서 SELECT count(*) FROM tc; 등 확인하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
