"""pytest 공용 설정: backend/ 를 import 경로에 추가."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
