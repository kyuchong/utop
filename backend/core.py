# -*- coding: utf-8 -*-
"""공용 고리 — 나뉜 라우트 파일이 main 의 것을 **거꾸로 부르지 않게** 한다.

main.py 를 쪼개면서 생기는 문제는 하나다. 라우트 파일이 broadcast·세션 확인
같은 main 의 이름을 써야 하는데, `from main import …` 로 가져오면 main 이 다
뜬 뒤에만 되고(nl_test 가 그렇다), 두 파일이 서로를 부르는 꼴이 된다.

그래서 **여기에 자리만 만들어 두고 main 이 뜨면서 채운다**(core.bind).
라우트 파일은 `import core` 뒤 `core.broadcast(…)` 처럼 **부를 때** 찾는다 —
`from core import broadcast` 로 이름을 미리 받아 두면 빈 자리를 쥐게 되므로
그렇게 쓰지 않는다.

engine.py 의 `engine.broadcast = broadcast` 주입과 같은 생각인데, 파일마다
따로 주입하지 않고 한 곳에 모은 것이다. 라우트 파일이 여섯이 되어도 main 의
접합부는 bind 한 번이다.
"""
from pathlib import Path
from typing import Any, Callable, Optional

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
#: 요구사항·위키 그림 폴더. main 이 bind 로 같은 값을 다시 넣는다(정본은 main).
REQ_IMG_DIR = DATA_DIR / "req_images"


async def broadcast(message: dict) -> None:
    """접속자 모두에게 소식을 보낸다 — main 이 바꿔 끼운다. 그 전에는 조용히 버린다."""
    return None


def user_from_token(token: str = "") -> Optional[dict]:
    """토큰(또는 미들웨어가 확인한 세션)의 사용자 — main 이 바꿔 끼운다."""
    return None


def require_admin(token: str = "") -> dict:
    """관리자가 아니면 401/403 — main 이 바꿔 끼운다."""
    raise RuntimeError("core 가 아직 매이지 않았습니다 — main.py 가 core.bind 를 부르기 전입니다")


_BOUND: dict[str, Any] = {}


def bind(**names: Callable | Path | Any) -> None:
    """main 이 뜨면서 제 것을 여기 채운다. 모르는 이름은 받지 않는다 — 오타가
    조용히 빈 자리로 남으면 라우트가 뜨긴 뜨는데 값이 어긋난다."""
    g = globals()
    for k, v in names.items():
        if k not in g or k.startswith("_") or k in ("bind", "bound"):
            raise KeyError(f"core 에 없는 이름입니다: {k}")
        g[k] = v
        _BOUND[k] = v


def bound() -> list[str]:
    """지금 매인 이름들 — 기동 로그·자기검사가 읽는다."""
    return sorted(_BOUND)
