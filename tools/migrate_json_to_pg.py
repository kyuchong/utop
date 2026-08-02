"""
JSON 파일 → PostgreSQL 일회성 마이그레이션.

실행:
  cd "c:/utop(2026_07_20)"
  .venv/Scripts/python.exe tools/migrate_json_to_pg.py                 # 원본 소스: c:/utop/data/
  .venv/Scripts/python.exe tools/migrate_json_to_pg.py --src d:/backup # 다른 경로에서
  .venv/Scripts/python.exe tools/migrate_json_to_pg.py --dry           # 실제 쓰기 없이 개수만

멱등성:
  - A 그룹은 (tcid/id) upsert
  - B 그룹(app_kv)은 name upsert
  - 여러 번 재실행 안전

검증:
  마이그레이션 후 각 리소스 개수를 원본 파일 개수와 비교해서 출력.
"""
from __future__ import annotations
import argparse, asyncio, json, sys
from pathlib import Path
from typing import Any

# Windows 콘솔 UTF-8 강제 (cp949 UnicodeEncodeError 회피)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# backend/db.py 를 import 하기 위해 경로 추가
_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
sys.path.insert(0, str(_ROOT / "backend"))
import db  # type: ignore


DEFAULT_SRC = Path("c:/utop/data")


# 컨테이너 파일(파일 하나 = 레코드 하나) → app_kv 로 이관
CONTAINER_FILES = [
    "users", "projects", "folders", "cycle_folders", "manual_folders",
    "notifications", "board", "manpower", "racks", "device_catalog",
    "jira", "confluence_config", "chat_sessions", "ai_feedback", "ai_usage",
    "learned_procedures", "release_summary", "release_judge", "zephyr_cache",
    # ↑ 위는 B 그룹 (이관 대상)
    # ↓ 아래는 C 그룹(설정)이지만 편의상 app_kv 에도 두면 서버 재기동 시
    #   파일과 DB 어느쪽이든 조회 가능. 우선은 이관 X (JSON 유지 방침)
]


def _load_json(p: Path) -> Any:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    except json.JSONDecodeError as e:
        print(f"  ! JSON parse error: {p.name} — {e}")
        return None


async def migrate_dir(dir_path: Path, upsert_fn, id_key: str, kind: str, dry: bool) -> int:
    """디렉토리 안의 각 *.json 을 upsert."""
    if not dir_path.exists():
        print(f"[{kind}] 디렉토리 없음: {dir_path} — skip")
        return 0
    files = sorted(dir_path.glob("*.json"))
    n = 0
    for f in files:
        data = _load_json(f)
        if not isinstance(data, dict):
            print(f"  ! {f.name}: dict 아님 — skip")
            continue
        rid = data.get(id_key) or data.get("id") or f.stem
        if not rid:
            print(f"  ! {f.name}: id 필드 없음 — skip")
            continue
        if not dry:
            try:
                await upsert_fn(str(rid), data)
                n += 1
            except Exception as e:
                print(f"  ! {f.name} upsert 실패: {e}")
        else:
            n += 1
    print(f"[{kind}] {n}/{len(files)} 건 이관")
    return n


async def migrate_containers(src: Path, dry: bool) -> int:
    """B 그룹 컨테이너 파일 → app_kv."""
    n = 0
    for name in CONTAINER_FILES:
        p = src / f"{name}.json"
        if not p.exists():
            print(f"[app_kv:{name}] 파일 없음 — skip")
            continue
        data = _load_json(p)
        if data is None:
            continue
        if not dry:
            try:
                await db.kv_set(name, data)
                n += 1
            except Exception as e:
                print(f"[app_kv:{name}] upsert 실패: {e}")
        else:
            n += 1
        # 크기 표시
        size = p.stat().st_size
        print(f"[app_kv:{name}] {size:>10,} bytes")
    return n


async def migrate_sessions(src: Path, dry: bool) -> int:
    """sessions.json (dict of session_id → data) → sessions 테이블."""
    p = src / "sessions.json"
    if not p.exists():
        print("[sessions] 파일 없음 — skip")
        return 0
    d = _load_json(p)
    if not isinstance(d, dict):
        print("[sessions] dict 아님 — skip")
        return 0
    n = 0
    for sid, sdata in d.items():
        if not isinstance(sdata, dict):
            continue
        username = sdata.get("username") or sdata.get("user") or ""
        exp = sdata.get("expires_at") or sdata.get("expires")
        if isinstance(exp, str):
            # ISO 문자열은 postgres 가 자동 파싱하므로 그대로 전달. 실패해도 None 처리.
            pass
        else:
            exp = None
        if not dry:
            try:
                await db.session_upsert(sid, sdata, expires_at=exp, username=username)
                n += 1
            except Exception as e:
                print(f"  ! session {sid[:8]} 실패: {e}")
        else:
            n += 1
    print(f"[sessions] {n}/{len(d)} 건 이관")
    return n


async def verify(src: Path) -> None:
    """이관 후 개수 비교."""
    print("\n═══ 검증 ═══")
    # A 그룹
    for kind, dir_name, count_fn in [
        ("tc", "tc", db.tc_list_full),
        ("cycle", "cycle", db.cycle_list_full),
        ("req", "req", db.req_list_full),
        ("manuals", "manuals", db.manuals_list_full),
    ]:
        dp = src / dir_name
        src_n = len(list(dp.glob("*.json"))) if dp.exists() else 0
        rows = await count_fn()
        dst_n = len(rows)
        mark = "OK " if src_n == dst_n else "!! "
        print(f"  {mark}{kind:8s} src={src_n:5d}  db={dst_n:5d}")
    # 컨테이너
    kv_names = await db.kv_list_names()
    print(f"  -- app_kv names: {len(kv_names)}")
    for n in kv_names:
        print(f"     · {n}")
    # sessions
    async with db.pool().acquire() as c:
        n = await c.fetchval("SELECT count(*) FROM sessions")
    src_sessions = _load_json(src / "sessions.json") or {}
    print(f"  -- sessions src={len(src_sessions):5d}  db={n:5d}")


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help="JSON 원본 디렉토리")
    ap.add_argument("--dry", action="store_true", help="실제 쓰기 없이 개수만")
    ap.add_argument("--only", choices=["tc","cycle","req","manuals","kv","sessions"],
                    help="특정 그룹만 이관")
    args = ap.parse_args()

    if not args.src.exists():
        print(f"원본 디렉토리 없음: {args.src}")
        sys.exit(2)

    print(f"원본: {args.src}")
    print(f"DSN : {db.DSN}")
    print(f"모드: {'DRY-RUN' if args.dry else 'LIVE'}")
    print()

    await db.init_pool()
    try:
        # A 그룹
        if not args.only or args.only == "tc":
            await migrate_dir(args.src / "tc", db.tc_upsert, "tcid", "tc", args.dry)
        if not args.only or args.only == "cycle":
            await migrate_dir(args.src / "cycle", db.cycle_upsert, "id", "cycle", args.dry)
        if not args.only or args.only == "req":
            await migrate_dir(args.src / "req", db.req_upsert, "id", "req", args.dry)
        if not args.only or args.only == "manuals":
            await migrate_dir(args.src / "manuals", db.manuals_upsert, "id", "manuals", args.dry)
        # B 그룹
        if not args.only or args.only == "kv":
            await migrate_containers(args.src, args.dry)
        # 세션
        if not args.only or args.only == "sessions":
            await migrate_sessions(args.src, args.dry)

        if not args.dry:
            await verify(args.src)
    finally:
        await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
