# -*- coding: utf-8 -*-
"""위키 — 문서 · 함께 쓰기(Yjs 중계) · 문서 안의 표.

main.py 에서 **글자 그대로** 옮겨 왔다(2026-09-28). 바뀐 것은 셋뿐이다.
  @app.X            → @router.X
  broadcast(…)      → core.broadcast(…)
  _user_from_token  → core.user_from_token
main 의 이름을 거꾸로 불러오지 않는다 — 그것이 필요한 자리는 core 가 댄다.
main.py 가 core.bind(…) 로 채운 뒤 include_router 한다.

이 파일이 대는 길:
  /api/wiki …            문서 목록·찾기·저장·복제·삭제·지난 판·PDF·워드 들이기
  /api/yjs/peers · /ws/yjs/{room}   같은 문서를 함께 고치는 중계
  /api/wiki-table …      문서 안의 표(노션식) 머리·칸·줄·들이기
"""
import asyncio
import json
import re
import secrets as _secrets
import time as _t
from datetime import datetime

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

import core
import db

router = APIRouter()


# ══════════════════════════════════════════════════════════════════
# 위키 — 프로젝트마다 갖는 문서
#
# 본문(body)은 편집기가 읽고 쓰는 **블록**이 정본이고, 찾기용 민글(plain)을
# 함께 담는다. 블록을 뒤져 찾을 수는 없다.
# ══════════════════════════════════════════════════════════════════
def _wiki_plain(body) -> str:
    """블록에서 글자만 훑어 낸다 — 찾기가 읽을 것.

    블록 꼴은 편집기가 정한다. 우리가 아는 것은 「어딘가에 text 가 있다」
    뿐이라, 모양을 따지지 않고 재귀로 긁는다. 모양이 바뀌어도 안 깨진다.
    """
    out = []

    def walk(v):
        if isinstance(v, dict):
            t = v.get("text")
            if isinstance(t, str):
                out.append(t)
            # 「살아 있는 표」 는 글자가 없다 — 담긴 것은 질의뿐이라, 찾기가
            # 훑을 것이 하나도 없어 문서에서 통째로 사라진다. 무엇을 가리키는
            # 블록인지만 남긴다: 플랜 ID 로 문서를 찾는 일이 실제로 있다.
            if v.get("type") == "utopView":
                p = v.get("props") or {}
                out.append(" ".join(
                    str(x) for x in ("UTOP 표", p.get("view"), p.get("cycle"), p.get("project")) if x
                ))
            # 문서 안의 **표**도 같은 사정이다 — 열·행은 서버에 있어 블록에는
            # 열쇠뿐이다. 표 이름만 남긴다(행 내용까지 담으면 문서 찾기가 표
            # 한 장에 파묻힌다).
            if v.get("type") == "utopTable":
                p = v.get("props") or {}
                out.append(" ".join(str(x) for x in ("표", p.get("title")) if x))
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)

    walk(body)
    return " ".join(out)[:200000]


HELP_SPACE = "__help__"


async def _help_guard(c, pid: str, payload: dict | None = None) -> None:
    """도움말 공간의 문서는 **관리자·도움말 편집자**만 쓴다(지시). 읽기는 누구나.
    새 문서면 payload 의 project 로, 있는 문서면 저장된 project 로 가린다."""
    prj = None
    if payload is not None and "project" in payload:
        prj = str(payload.get("project") or "")
    row = await c.fetchrow("SELECT project FROM wiki_page WHERE id=$1", pid)
    if row is not None and prj is None:
        prj = str(row["project"] or "")
    cur_prj = str(row["project"] or "") if row is not None else ""
    if HELP_SPACE in (prj, cur_prj) and not core.help_can_edit():
        raise HTTPException(403, "도움말을 고칠 권한이 없습니다 — SETUP › 페이지별 접근 권한에서 「도움말 · 고치기」 를 줍니다")


# ───────────────────────────────────────────
# 위키 첨부 파일(지시: 파일 업로드 되도록) — 그림이 아닌 파일(PDF·엑셀·zip·로그…)
#
# 그림은 예전처럼 /api/upload/image(data/req_images)로 가고, 그 밖의 파일은
# 여기로 온다. 파일은 data/wiki_files/ 에 둔다 — 도커 볼륨(app-data)이라
# 그림과 함께 백업된다. 이름은 서버가 정한다(경로 조작·덮어쓰기 차단).
#
# 받기는 로그인 없이 열린다(main 의 _AUTH_PUBLIC) — 본문의 링크·<video> 는
# 헤더를 못 붙이기 때문이다. 그림 주소와 같게, 추측할 수 없는 이름이 문이다.
# 실행 파일(.exe·.bat·.ps1 …)만 받지 않는다. 브라우저가 열 수 있는 것(PDF·동영상·
# 소리)만 그 자리에서 열고, 나머지 — 글·HTML·스크립트·확장자 없는 로그(running-config
# 같은 것)까지 — 는 늘 내려받기(octet-stream·nosniff)로 준다. 같은 주소에서
# 스크립트가 돌 일이 없으므로 HTML 보고서·.sh 도 받는다(지적: 업로드 실패).
# ───────────────────────────────────────────
WIKI_FILE_DIR = core.DATA_DIR / "wiki_files"
WIKI_FILE_MAX = 50 * 1024 * 1024        # nginx 는 100m 까지 통과시킨다
_WIKI_FILE_BLOCK = {
    ".exe", ".msi", ".dll", ".com", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".vbe", ".jse",
    ".wsf", ".hta", ".jar", ".lnk", ".reg", ".cpl", ".msc", ".pif",
}
_WIKI_FILE_INLINE = {
    ".pdf": "application/pdf",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".ogv": "video/ogg",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4",
}


@router.post("/api/upload/file")
async def upload_wiki_file(file: UploadFile = File(...)):
    """위키 첨부 — 그림이 아닌 파일. 돌려준 url 을 본문 파일 블록이 쥔다."""
    from pathlib import Path as _P
    orig = _P(file.filename or "").name or "file"
    ext = _P(orig).suffix.lower()
    # 확장자 없는 파일(장비 로그·running-config)도 받는다. 꼴이 이상한 꼬리는 떼고 둔다
    if not re.fullmatch(r"\.[a-z0-9]{1,12}", ext):
        ext = ""

    def _no(code: int, why: str):
        print(f"[wiki-upload] 거절 {orig!r}: {why}", flush=True)   # 화면이 까닭을 놓쳐도 여기 남는다
        raise HTTPException(code, why)

    if ext in _WIKI_FILE_BLOCK:
        _no(400, f"{ext} 파일은 올릴 수 없습니다 (실행 파일) — zip 으로 묶어 올리세요")
    raw = await file.read(WIKI_FILE_MAX + 1)
    if not raw:
        _no(400, "빈 파일입니다")
    if len(raw) > WIKI_FILE_MAX:
        _no(413, f"{WIKI_FILE_MAX // 1024 // 1024}MB 이하만 올릴 수 있습니다")
    WIKI_FILE_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{int(datetime.now().timestamp() * 1000)}-{_secrets.token_hex(6)}{ext}"
    (WIKI_FILE_DIR / name).write_bytes(raw)
    from urllib.parse import quote as _q
    # 원래 이름은 주소 꼬리(?n=)로 싣는다 — 내려받을 때 그 이름으로 저장되게
    return {"url": f"/api/wiki-files/{name}?n={_q(orig)}", "name": orig, "size": len(raw)}


@router.get("/api/wiki-files/{name}")
async def get_wiki_file(name: str, n: str = "", download: str = ""):
    """첨부 받기 — 브라우저가 열 수 있는 것만 그 자리에서, 나머지는 내려받기."""
    if not re.fullmatch(r"[0-9]+-[0-9a-f]+(\.[a-z0-9]{1,12})?", name or ""):
        raise HTTPException(400, "잘못된 파일명입니다")
    f = WIKI_FILE_DIR / name
    if not f.is_file():
        raise HTTPException(404, "파일을 찾을 수 없습니다")
    ext = f.suffix.lower()
    mt = _WIKI_FILE_INLINE.get(ext)
    inline = bool(mt) and not download
    from urllib.parse import quote as _q
    from pathlib import Path as _P
    show = _P(str(n or "")).name.strip() or name
    if ext and not show.lower().endswith(ext):
        show += ext                      # 꼬리 이름을 바꿔 다른 종류로 받게 하지 못한다
    disp = f"filename*=UTF-8''{_q(show)}"
    return FileResponse(
        str(f),
        media_type=mt or "application/octet-stream",
        headers={
            "Content-Disposition": f"inline; {disp}" if inline else f"attachment; {disp}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=31536000, immutable",
        },
    )


@router.get("/api/wiki")
async def wiki_list(project: str = ""):
    """문서 트리 — 본문은 안 준다. 목록에 본문까지 실으면 수백 KB 가 된다."""
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            # 프로젝트를 골랐어도 **프로젝트 없는 문서는 늘 보인다.**
            #
            # 「전체 프로젝트」 로 두고 쓴 문서는 project 가 빈 값으로 저장된다.
            # 그런데 나중에 프로젝트를 하나 고르면 그 문서들이 목록에서 통째로
            # 사라져, 쓴 사람은 **지워진 줄 안다**(지적: 문서가 다 날아갔다).
            # 빈 값은 「이 프로젝트 것이 아니다」 가 아니라 「어느 프로젝트에도
            # 매이지 않았다」 — 공용 문서다. 공용은 어디서 보든 보여야 한다.
            "SELECT id, project, parent_id, title, ord, updated_by, updated_at "
            # 도움말 공간(__help__)은 **그 공간의 문서만** — 공용(프로젝트 없음) 문서를 어디서든 보이게 하는
            # 규칙을 여기에도 적용했더니 실제 위키 문서가 도움말 나무에 섞였다(지적, 213 에서 실제로). 반대로
            # 일반 위키에는 도움말이 안 섞인다.
            "FROM wiki_page WHERE (CASE WHEN $1='__help__' THEN project='__help__' "
            "  ELSE ($1='' OR project=$1 OR coalesce(project,'')='') AND coalesce(project,'') <> '__help__' END) "
            "ORDER BY ord, title",
            project,
        )
    return {
        "pages": [
            {**dict(r), "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None}
            for r in rows
        ]
    }


@router.get("/api/wiki/search")
async def wiki_search(q: str, project: str = "", limit: int = 40):
    """**본문까지** 찾는다 — 이름만으로는 「그 말이 어느 문서에 있더라」 를 못 찾는다.

    민글(plain)을 그대로 훑는다. 전문검색 색인을 쓰지 않는 것은 문서가 수천
    장이 아니기 때문이다 — 지금 크기에서 ILIKE 로 충분하고, 색인은 한국어
    형태소를 걸어야 제구실을 해서 값이 크다.
    """
    n = (q or "").strip()
    if not n:
        return {"hits": []}
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            "SELECT id, title, plain FROM wiki_page "
            # 목록과 **같은 규칙** — 프로젝트 없는 문서는 늘 걸린다.
            # 목록에는 보이는데 찾기에는 안 걸리면 그건 더 헷갈린다.
            "WHERE (CASE WHEN $2='__help__' THEN project='__help__' "
            "  ELSE ($2='' OR project=$2 OR coalesce(project,'')='') AND coalesce(project,'') <> '__help__' END) "
            "AND (title ILIKE $1 OR plain ILIKE $1) "
            "ORDER BY updated_at DESC LIMIT $3",
            f"%{n}%", project, max(1, min(200, limit)),
        )
    out = []
    for r in rows:
        p = r["plain"] or ""
        i = p.lower().find(n.lower())
        # 걸린 자리 앞뒤를 잘라 보여 준다 — 「어디에 있나」 를 열지 않고 알게
        snip = p[max(0, i - 40) : i + 80] if i >= 0 else ""
        out.append({"id": r["id"], "title": r["title"], "snippet": snip})
    return {"hits": out}


@router.get("/api/wiki/{pid}")
async def wiki_get(pid: str):
    async with db.pool().acquire() as c:
        r = await c.fetchrow("SELECT * FROM wiki_page WHERE id=$1", pid)
    if not r:
        raise HTTPException(404, "문서를 찾을 수 없습니다")
    d = dict(r)
    for k in ("created_at", "updated_at"):
        if d.get(k):
            d[k] = d[k].isoformat()
    if isinstance(d.get("body"), str):
        try:
            d["body"] = json.loads(d["body"])
        except Exception:
            d["body"] = []
    return {"page": d}


# ── 고정 주소는 {pid} 보다 **먼저** 등록한다 ─────────────────────────
#
# FastAPI 는 먼저 등록된 길부터 맞춰 본다. `/api/wiki/{pid}` 가 위에 있으면
# `/api/wiki/pdf` 요청이 pid="pdf" 로 걸려 **「pdf 라는 이름의 문서를 저장」**
# 이 된다. 200 이 돌아오니 화면은 성공으로 보이는데 정작 PDF 는 없다 —
# 그리고 wiki_page 에 쓰레기 문서가 하나 생긴다. 워드 가져오기도 같은 일을
# 겪었다(지적: PDF·워드 둘 다 안 된다).
@router.post("/api/wiki/pdf")
async def wiki_pdf(payload: dict):
    """문서를 **PDF 파일로 구워서** 돌려준다.

    여태는 브라우저 인쇄 창을 띄웠다 — 미리보기가 뜨고, 대상을 고르고, 저장을
    눌러야 했다. 게다가 종이가 화면과 자꾸 갈렸다: 인쇄 창이 앱 CSS 를 못
    불러오거나 옛 판을 들고 갔다.

    화면이 보내 준 **그 HTML 그대로** 크로미움으로 찍는다. 화면을 그리는
    엔진과 종이를 찍는 엔진이 하나라, 갈릴 자리가 없다.
    """
    html = str(payload.get("html") or "")
    title = str(payload.get("title") or "문서")
    # 들어온 것부터 남긴다 — 요청이 여기까지 왔는지가 첫 갈림길이다.
    print(f"[pdf] 요청 도착 — {title} / html {len(html)}글자", flush=True)
    if not html.strip():
        return {"ok": False, "error": "찍을 내용이 없습니다"}
    try:
        from playwright.async_api import async_playwright
    except Exception as e:
        return {"ok": False, "error": "PDF 엔진이 없습니다: " + str(e)[:120]}

    import base64 as _b64
    try:
        async with async_playwright() as pw:
            br = await pw.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
            pg = await br.new_page()
            # 글꼴·그림이 다 앉은 뒤에 찍는다. 바로 찍으면 글자가 자리를 잡기
            # 전이라 줄이 어긋나고 그림 자리가 빈다.
            await pg.set_content(html, wait_until="networkidle")
            await pg.emulate_media(media="print")
            # 배율 90%(지시).
            #
            # 100% 로 찍으면 CSS 에 적은 크기가 그대로 나간다 — 틀리진 않지만
            # 종이에서는 빡빡하다. 90% 로 한 번 줄이면 한 장에 더 담기고,
            # **글자와 표와 그림이 같은 비율로** 줄어 균형이 안 깨진다.
            # 글자 크기만 따로 줄이면 표·그림만 커 보인다.
            if payload.get("slide"):
                # 결과서 슬라이드(1280×720 고정 지오메트리) — 쪽 크기를
                # 슬라이드에 맞추면 한 장이 정확히 한 쪽이 된다. A4 에
                # 욱여넣으면 잘리거나 여백이 남는다.
                pdf = await pg.pdf(
                    width="1280px",
                    height="720px",
                    print_background=True,
                )
            else:
                pdf = await pg.pdf(
                    format="A4",
                    margin={"top": "14mm", "right": "14mm", "bottom": "14mm", "left": "14mm"},
                    print_background=True,
                    scale=0.9,
                )
            await br.close()
    except Exception as e:
        return {"ok": False, "error": "PDF 를 만들지 못했습니다: " + str(e)[:300]}

    print(f"[pdf] {title} — {len(pdf)}B", flush=True)
    return {"ok": True, "name": f"{title}.pdf", "data": _b64.b64encode(pdf).decode()}


@router.post("/api/wiki/import-docx")
async def wiki_import_docx(payload: dict):
    """워드(.docx) 를 위키가 읽을 수 있는 HTML 로 푼다.

    브라우저는 .docx 를 못 읽는다 — 압축 파일이라 풀어야 하고, 그림은 그 안에
    따로 들어 있다. 그래서 서버가 푼다.

    **그림은 파일로 떼어 저장한다.** 처음에는 문서 안에 data URI 로 담았는데,
    그림 다섯 장짜리 보고서 하나가 HTML 500KB 가 되었고 그대로 위키 본문에
    실려 저장이 무거워졌다(지적: 사진이 저장이 안 된다). 파일로 빼면 본문에는
    주소 한 줄만 남는다 — 요구사항 그림이 이미 쓰는 그 자리(data/req_images)
    와 그 주소(/api/req-images/…)를 그대로 쓴다. 볼륨 하나만 챙기면 함께
    백업되는 것도 같다.

    **표 안의 표**가 까다롭다. 편집기의 표는 칸 안에 표를 담지 못한다. 그렇다고
    버리면 내용이 사라지므로, 안쪽 표를 **바깥 표 뒤로 떼어** 내고 원래 자리에는
    「여기에 표가 있었다」 는 표시를 남긴다. 모양은 펴지지만 잃는 글자는 없다.
    """
    import base64 as _b64, io as _io
    raw = str(payload.get("data") or "")
    if raw.strip().startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    try:
        blob = _b64.b64decode(raw)
    except Exception as e:
        return {"ok": False, "error": "파일을 읽지 못했습니다: " + str(e)[:120]}
    if not blob:
        return {"ok": False, "error": "빈 파일입니다"}

    # ── PDF 도 받는다(지시: 제품 스펙 PDF 를 위키 문서로) — markitdown 이
    # 글자를 뽑고, 아래 미니 변환기가 제목·목록·표 정도만 HTML 로 편다.
    # 스캔 이미지 PDF 는 글자가 안 나온다 — 그건 변환 실패로 말해 준다.
    name = str(payload.get("name") or "")
    is_pdf = name.lower().endswith(".pdf") or blob[:5] == b"%PDF-"
    if is_pdf:
        try:
            from markitdown import MarkItDown
        except Exception as e:
            return {"ok": False, "error": "PDF 변환기가 없습니다: " + str(e)[:120]}
        import tempfile as _tf, os as _os, html as _html, re as _re2
        tmp = None
        try:
            with _tf.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
                fh.write(blob)
                tmp = fh.name
            md = MarkItDown(enable_plugins=False).convert(tmp).text_content or ""
        except Exception as e:
            return {"ok": False, "error": f"PDF 를 읽지 못했습니다: {str(e)[:140]}"}
        finally:
            if tmp:
                try:
                    _os.unlink(tmp)
                except Exception:
                    pass
        if len(md.strip()) < 20:
            return {"ok": False, "error": "PDF 에서 글자를 찾지 못했습니다 — 스캔 이미지 PDF 는 읽을 수 없습니다"}
        # 마크다운 비슷한 글 → 단순 HTML (제목·글머리표·표·문단)
        out_lines: list[str] = []
        para: list[str] = []
        in_ul = False
        def _flush():
            nonlocal para
            if para:
                out_lines.append("<p>" + _html.escape(" ".join(para)) + "</p>")
                para = []
        def _ul_close():
            nonlocal in_ul
            if in_ul:
                out_lines.append("</ul>")
                in_ul = False
        lines = md.splitlines()
        i2 = 0
        while i2 < len(lines):
            ln = lines[i2].rstrip()
            m = _re2.match(r"^(#{1,4})\s+(.*)$", ln)
            if m:
                _flush(); _ul_close()
                lv = min(3, len(m.group(1)) + 1)
                out_lines.append(f"<h{lv}>" + _html.escape(m.group(2)) + f"</h{lv}>")
            elif _re2.match(r"^\s*[-*•]\s+", ln):
                _flush()
                if not in_ul:
                    out_lines.append("<ul>"); in_ul = True
                out_lines.append("<li>" + _html.escape(_re2.sub(r"^\s*[-*•]\s+", "", ln)) + "</li>")
            elif "|" in ln and ln.strip().startswith("|"):
                _flush(); _ul_close()
                trs = []
                while i2 < len(lines) and "|" in lines[i2] and lines[i2].strip().startswith("|"):
                    cells = [c.strip() for c in lines[i2].strip().strip("|").split("|")]
                    if not all(_re2.fullmatch(r":?-{2,}:?", c or "-") for c in cells):
                        trs.append("<tr>" + "".join("<td>" + _html.escape(c) + "</td>" for c in cells) + "</tr>")
                    i2 += 1
                out_lines.append("<table><tbody>" + "".join(trs) + "</tbody></table>")
                continue
            elif not ln.strip():
                _flush(); _ul_close()
            else:
                para.append(ln.strip())
            i2 += 1
        _flush(); _ul_close()
        html2 = "".join(out_lines)
        print(f"[pdf-import] {name or '(이름 없음)'} {len(blob)}B → 글자 {len(md)} → html {len(html2)}", flush=True)
        return {"ok": True, "html": html2, "images": 0}

    try:
        import mammoth
        from bs4 import BeautifulSoup
    except Exception as e:
        return {"ok": False, "error": "변환기를 불러오지 못했습니다: " + str(e)[:120]}

    # 그림 — 파일로 떼어 두고 주소만 돌려준다. 너무 큰 것은 줄인다.
    import secrets as _sec
    saved = {"n": 0}

    def _img(image):
        with image.open() as f:
            data = f.read()
        ctype = (image.content_type or "image/png")
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
               "image/webp": ".webp", "image/bmp": ".bmp"}.get(ctype, ".png")
        try:
            from PIL import Image
            im = Image.open(_io.BytesIO(data))
            if im.width > 1600:
                im = im.convert("RGB") if im.mode in ("P", "CMYK") else im
                h = max(1, round(im.height * 1600 / im.width))
                im = im.resize((1600, h))
                buf = _io.BytesIO()
                im.save(buf, format="PNG")
                data, ext = buf.getvalue(), ".png"
        except Exception:
            pass  # 못 줄이면 원본 그대로 — 그림 하나 때문에 가져오기를 막지 않는다
        try:
            core.REQ_IMG_DIR.mkdir(parents=True, exist_ok=True)
            name = f"wk-{int(datetime.now().timestamp() * 1000)}-{_sec.token_hex(4)}{ext}"
            (core.REQ_IMG_DIR / name).write_bytes(data)
            saved["n"] += 1
            return {"src": f"/api/req-images/{name}"}
        except Exception:
            # 못 쓰면 문서 안에 담는다 — 그림을 잃느니 무거운 편이 낫다
            return {"src": f"data:{ctype};base64,{_b64.b64encode(data).decode()}"}

    try:
        res = mammoth.convert_to_html(_io.BytesIO(blob), convert_image=mammoth.images.img_element(_img))
        html = res.value or ""
    except Exception as e:
        return {"ok": False, "error": "워드 문서를 푸는 데 실패했습니다: " + str(e)[:200]}

    # mammoth 가 빈손이면 **직접 뜯는다.**
    #
    # mammoth 는 스타일·번호 정의가 온전한 문서를 전제한다. 다른 도구가 만든
    # docx, 옛 문서를 변환한 docx 는 그 전제를 깨서 빈 결과가 나온다. 그럴 때
    # 「못 가져왔다」 로 끝내면 사람은 방법이 없다 — 글자는 분명히 문서 안에
    # 있는데도.
    #
    # word/document.xml 을 열어 문단(w:p)과 표(w:tbl)만 곧이곧대로 옮긴다.
    # 서식은 잃지만 **글과 표 구조는 살아 남는다.** 아무것도 못 가져오는 것보다
    # 낫고, 사람이 문서에서 이어 고칠 수 있다.
    if not html.strip():
        try:
            import zipfile as _zip, re as _re2, html as _h
            with _zip.ZipFile(_io.BytesIO(blob)) as z:
                xml = z.read("word/document.xml").decode("utf-8", "ignore")

            def _text(node: str) -> str:
                return _h.escape("".join(_re2.findall(r"<w:t[^>]*>(.*?)</w:t>", node, _re2.S)))

            out = []
            # 표와 문단을 **나온 차례대로** 훑는다 — 문단만 먼저 모으면 표가
            # 문서 끝으로 밀려 읽는 차례가 바뀐다.
            for m in _re2.finditer(r"<w:tbl>.*?</w:tbl>|<w:p[ >].*?</w:p>", xml, _re2.S):
                blk = m.group(0)
                if blk.startswith("<w:tbl"):
                    rows = []
                    for tr in _re2.findall(r"<w:tr[ >].*?</w:tr>", blk, _re2.S):
                        cells = _re2.findall(r"<w:tc[ >].*?</w:tc>", tr, _re2.S)
                        rows.append("<tr>" + "".join(f"<td>{_text(c)}</td>" for c in cells) + "</tr>")
                    if rows:
                        out.append("<table>" + "".join(rows) + "</table>")
                else:
                    t = _text(blk)
                    if not t.strip():
                        continue
                    lvl = _re2.search(r'w:pStyle w:val="Heading(\d)"', blk)
                    out.append(f"<h{lvl.group(1)}>{t}</h{lvl.group(1)}>" if lvl else f"<p>{t}</p>")
            if out:
                html = "".join(out)
                print(f"[docx] mammoth 빈손 → 직접 뜯음: {len(out)}덩이", flush=True)
        except Exception as e:
            print(f"[docx] 직접 뜯기도 실패: {str(e)[:120]}", flush=True)

    # 푼 결과가 비었으면 **왜 비었는지** 말한다.
    #
    # 200 으로 답했는데 화면은 「못 가져왔다」 만 띄우면, 서버 탓인지 문서 탓인지
    # 알 길이 없다(지적: 200인데 못 가져왔다고 한다). 흔한 까닭은 옛 .doc 를
    # 이름만 .docx 로 바꾼 경우다 — 속이 전혀 다른 형식이라 풀리지 않는다.
    if not html.strip():
        why = "문서에서 옮길 내용을 찾지 못했습니다"
        if blob[:2] == b"\xd0\xcf":
            why = "옛 워드(.doc) 형식입니다 — 워드에서 「다른 이름으로 저장 → .docx」 한 뒤 다시 해 주세요"
        elif blob[:2] != b"PK":
            why = "워드 문서가 아닙니다(.docx 가 아님)"
        elif not (res.messages or []):
            why = "문서가 비어 있습니다"
        print(f"[docx] 빈 결과 — {len(blob)}B 머리={blob[:4]!r} :: {why}", flush=True)
        return {
            "ok": False,
            "error": why,
            "bytes": len(blob),
            # 파일 머리 네 글자 — 사람이 화면에서 바로 읽고 갈릴 수 있게
            "head": blob[:4].hex(" "),
            "messages": [str(m) for m in (res.messages or [])][:10],
        }

    # 표 안의 표를 바깥으로 떼어 내고, **글자 크기는 버린다.**
    moved = 0
    try:
        soup = BeautifulSoup(html, "html.parser")

        # ── 그림을 제목 밖으로 꺼낸다 ──────────────────────────
        #
        # 워드는 제목 문단 안에 그림을 넣는다(<h2>숙박비 기준<br/><img/></h2>).
        # 편집기의 제목 블록은 **글자만** 담아서, 그 안의 그림은 통째로
        # 버려진다 — 서버는 잘 넘겼는데 화면에는 한 장도 안 나왔다(지적).
        # 그림을 제목 뒤로 꺼내 제 블록으로 세운다. 글은 제목에 남는다.
        for _h in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "li"]):
            _imgs = _h.find_all("img")
            if not _imgs:
                continue
            for _im in _imgs:
                _im.extract()
                _p = soup.new_tag("p")
                _p.append(_im)
                _h.insert_after(_p)
            # 그림만 있던 제목은 빈 껍데기로 남는다 — 빈 제목은 목차를 어지럽힌다
            if not _h.get_text(strip=True):
                _h.decompose()

        # ── 「제목」 이라 적혀 있지만 본문인 줄 ────────────────
        #
        # 이 문서는 본문 줄에도 「제목 2」 를 썼다(실제 원본). 진짜 제목인
        # 「AI … 진행 현황 요약」 과 본문인 「고객사 원격 시연 일정 : …」 이
        # 워드에서 **완전히 같다** — 스타일도 목록 수준도 같아서 기계가 가릴
        # 수 없다(지적: 본문이 제목으로 들어온다).
        #
        # 그래서 **사람이 고르게 한다.** 몇 단이 몇 개인지 세어 돌려주고,
        # 「N단부터 본문으로」 를 받으면 그때 내린다. 짐작으로 내리면 진짜
        # 제목까지 함께 내려가 목차가 사라진다.
        head_src = {}
        for _lv in range(1, 7):
            _n = len(soup.find_all(f"h{_lv}"))
            if _n:
                head_src[_lv] = _n
        _from = payload.get("body_from")
        try:
            _from = int(_from) if _from is not None else 0
        except Exception:
            _from = 0
        if _from and 1 <= _from <= 6:
            for _lv in range(_from, 7):
                for _el in soup.find_all(f"h{_lv}"):
                    _el.name = "p"
            print(f"[docx] 제목 {_from}단 이하를 본문으로 내렸습니다", flush=True)

        # ── 제목 단을 **원본 크기에 맞춘다** ───────────────────
        #
        # 이 문서는 문단 109개 중 91개가 「제목 2」 다. 워드에서 제목 2 는
        # 14pt(≈19px)인데 위키의 2단은 24px 이라, 문서 전체가 부풀어 보였다
        # (지적: 글씨가 왜 그리 큰가). 단 번호를 그대로 옮기지 말고 **그
        # 문서에서 그 제목이 실제로 몇 px 이었나**를 보고 가장 가까운 단으로
        # 옮긴다. 그러면 워드에서 보던 크기 그대로 읽힌다.
        _WIKI_PX = [26, 24, 22, 20, 18, 16]   # 위키 1~6단 (승인된 눈금)
        try:
            import zipfile as _zip
            _st = _zip.ZipFile(_io.BytesIO(blob)).read("word/styles.xml").decode("utf-8", "ignore")
            _lv2px = {}
            for _m in re.finditer(r"<w:style [^>]*w:styleId=\"([^\"]+)\">(.*?)</w:style>", _st, re.S):
                _body = _m.group(2)
                _nm = re.search(r'<w:name w:val="heading (\d)"', _body)
                _sz = re.search(r'<w:sz w:val="(\d+)"', _body)
                if _nm and _sz:
                    _lv2px[int(_nm.group(1))] = int(_sz.group(1)) / 2 * 4 / 3
            _map, _floor = {}, 1
            for _lv in sorted(_lv2px):
                _px = _lv2px[_lv]
                _best = min(range(len(_WIKI_PX)), key=lambda i: abs(_WIKI_PX[i] - _px)) + 1
                _best = max(_best, _floor)          # 아래 단이 위 단보다 커지면 안 된다
                _map[_lv] = min(6, _best)
                _floor = _map[_lv] + 1
            if _map:
                for _lv in sorted(_map, reverse=True):   # 뒤에서부터 — 겹쳐 덮지 않게
                    if _map[_lv] == _lv:
                        continue
                    for _el in soup.find_all(f"h{_lv}"):
                        _el.name = f"h{_map[_lv]}"
                print(f"[docx] 제목 단 옮김 {_map} (원본 pt→px {_lv2px})", flush=True)
        except Exception as _e:
            print(f"[docx] 제목 크기를 못 읽었습니다: {str(_e)[:100]}", flush=True)

        # 워드에서 온 글자 크기를 걷어낸다.
        #
        # 워드 문서는 같은 「제목 2」 인데도 12pt 인 것과 10pt 인 것이 섞여
        # 있다(실제 원본이 그랬다). mammoth 는 그 크기를 글자마다 그대로
        # 옮기므로, 편집기에서도 제목이 어떤 건 크고 어떤 건 작다(지적).
        #
        # 크기가 아니라 **제목 몇 단인가**만 가져온다. 그러면 워드가 어떻든
        # 이 문서의 눈금으로 정돈된다 — 위키는 문서마다 제목 크기가 달라지면
        # 목차로 읽히지 않는다. 색·굵기 같은 다른 꾸밈은 건드리지 않는다.
        import re as _restyle
        for el in soup.find_all(style=True):
            st = _restyle.sub(r"font-size\s*:[^;]*;?", "", el["style"]).strip()
            if st:
                el["style"] = st
            else:
                del el["style"]
        for outer in list(soup.find_all("table")):
            inners = [t for t in outer.find_all("table") if t is not outer]
            for inner in inners:
                mark = soup.new_tag("p")
                moved += 1
                mark.string = f"[표 {moved}] — 아래에 이어집니다"
                inner.replace_with(mark)
                cap = soup.new_tag("p")
                cap.string = f"[표 {moved}] 위 표 안에 있던 표"
                outer.insert_after(inner)
                outer.insert_after(cap)
        html = str(soup)
    except Exception:
        pass  # 못 펴도 가져오기는 계속한다

    print(
        f"[docx] {len(blob)}B 머리={blob[:4]!r} html={len(html)}글자 "
        f"표속표={moved} 알림={len(res.messages or [])}",
        flush=True,
    )
    return {
        "ok": True,
        "html": html,
        "nested_tables": moved,
        # 그림을 몇 장 떼어 냈나 — 화면이 「사진 N장」 이라고 말해 준다.
        # 조용히 넘어가면 안 가져온 것인지 아닌지 알 수가 없다(지적).
        "images": saved["n"],
        # 단마다 몇 줄인지 — 화면이 이걸 보고 「본문으로 내릴까요」 를 묻는다
        "headings": head_src,
        # 무엇이 안 넘어왔는지 사람이 알아야 한다 — 조용히 빠지면 나중에 찾는다
        "messages": [str(m) for m in (res.messages or [])][:20],
    }


@router.post("/api/wiki/{pid}")
async def wiki_save(pid: str, payload: dict, request: Request):
    """만들기·고치기 공통.

    저장할 때마다 **지난 판을 한 줄 남긴다**(wiki_rev). 되돌릴 수 있어야 사람이
    마음 놓고 고친다 — 못 되돌리면 지우기가 무서워 문서가 안 정리된다.
    """
    s = getattr(request.state, "user", None)
    who = (s or {}).get("username") or ""
    title = str(payload.get("title") or "")
    body = payload.get("body")
    if body is None:
        body = []
    plain = _wiki_plain(body)
    async with db.pool().acquire() as c:
        await _help_guard(c, pid, payload)
        old = await c.fetchrow("SELECT title, body FROM wiki_page WHERE id=$1", pid)
        if old:
            await c.execute(
                "INSERT INTO wiki_rev (page_id, title, body, who) VALUES ($1,$2,$3::jsonb,$4)",
                pid, old["title"], old["body"] if isinstance(old["body"], str) else json.dumps(old["body"], ensure_ascii=False), who,
            )
            await c.execute(
                "UPDATE wiki_page SET title=$2, body=$3::jsonb, plain=$4, updated_by=$5, "
                "updated_at=now() WHERE id=$1",
                pid, title, json.dumps(body, ensure_ascii=False), plain, who,
            )
        else:
            await c.execute(
                "INSERT INTO wiki_page (id, project, parent_id, title, body, plain, ord, created_by, updated_by) "
                "VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8)",
                pid, str(payload.get("project") or ""), payload.get("parent_id"),
                title, json.dumps(body, ensure_ascii=False), plain,
                int(payload.get("ord") or 0), who,
            )
    # **누가** 저장했는지 함께 보낸다. 받는 쪽은 그것으로 「내가 방금 한 것」
    # 을 걸러 내고, 남이 한 것이면 이름을 말해 준다 — 「누가 고쳤는지 모르는
    # 채 화면이 바뀌는 것」 은 고장으로 읽힌다.
    try: asyncio.create_task(core.broadcast({"type": "wiki_updated", "id": pid, "user": who}))
    except Exception: pass
    return {"ok": True, "id": pid}


def _wiki_tids(body) -> list[str]:
    """문서 안에 꽂힌 표의 열쇠를 모은다(하위 블록까지)."""
    out: list[str] = []

    def walk(ns):
        for n in ns or []:
            if not isinstance(n, dict):
                continue
            if n.get("type") == "utopTable":
                t = str((n.get("props") or {}).get("tid") or "")
                if t:
                    out.append(t)
            walk(n.get("children"))

    walk(body if isinstance(body, list) else [])
    return out


def _wiki_swap_tids(body, mp: dict) -> None:
    """표 열쇠를 새것으로 바꿔 끼운다(제자리)."""

    def walk(ns):
        for n in ns or []:
            if not isinstance(n, dict):
                continue
            if n.get("type") == "utopTable":
                pr = dict(n.get("props") or {})
                t = str(pr.get("tid") or "")
                if t in mp:
                    pr["tid"] = mp[t]
                    n["props"] = pr
            walk(n.get("children"))

    walk(body if isinstance(body, list) else [])


def _new_id(pre: str) -> str:
    import secrets as _sc
    import time as _tm          # 전역에 없다 — 이 파일은 자리마다 따로 들인다
    return f"{pre}-{int(_tm.time() * 1000)}-{_sc.token_hex(3)}"


async def _wtbl_clone(c, src: str, dst: str, page_id: str) -> None:
    """표 한 벌을 통째로 뜬다 — 칸 정의도 줄도."""
    r = await c.fetchrow("SELECT title, cols, calcs, view FROM wiki_table WHERE id=$1", src)
    if not r:
        return
    await c.execute(
        "INSERT INTO wiki_table (id, page_id, title, cols, calcs, view) VALUES ($1,$2,$3,$4,$5,$6)"
        " ON CONFLICT (id) DO NOTHING",
        dst, page_id, r["title"], r["cols"], r["calcs"], r["view"],
    )
    # 줄 열쇠(rid)는 그대로 둔다 — 기본키가 (tid, rid) 라 표가 다르면 안 부딪친다
    await c.execute(
        "INSERT INTO wiki_table_row (tid, rid, ord, data)"
        " SELECT $2, rid, ord, data FROM wiki_table_row WHERE tid=$1",
        src, dst,
    )


@router.post("/api/wiki/{pid}/duplicate")
async def wiki_duplicate(pid: str, payload: dict, request: Request):
    """문서를 통째로 베낀다 — **안에 든 표까지.**

    블록에는 표의 열쇠(tid)만 담긴다. 그래서 문서만 베끼면 벤 것과 원본이 **같은
    표**를 가리켜, 한쪽에서 칸을 고치면 다른 쪽도 바뀐다. 「26년 것을 베껴 27년을
    만든다」 가 안 되는 것이다. 표도 새로 떠서 열쇠를 바꿔 끼운다.

    하위 문서도 함께 벤다(deep) — 폴더를 베꼈는데 속이 비어 있으면 벤 것이 아니다.
    """
    s = getattr(request.state, "user", None)
    who = (s or {}).get("username") or ""
    p = payload or {}
    deep = bool(p.get("deep", True))

    async with db.pool().acquire() as c:
        await _help_guard(c, pid)
        root = await c.fetchrow(
            "SELECT id, project, parent_id, title, body, ord FROM wiki_page WHERE id=$1", pid)
        if not root:
            raise HTTPException(404, "문서를 찾을 수 없습니다")

        # 벨 문서들 — 뿌리부터 너비 우선으로
        todo = [dict(root)]
        pages = [dict(root)]
        if deep:
            while todo:
                cur = todo.pop(0)
                kids = await c.fetch(
                    "SELECT id, project, parent_id, title, body, ord FROM wiki_page"
                    " WHERE parent_id=$1 ORDER BY ord, title", cur["id"])
                for k in kids:
                    d = dict(k)
                    pages.append(d)
                    todo.append(d)
        if len(pages) > 300:
            raise HTTPException(400, f"문서가 너무 많습니다({len(pages)}개) — 300개까지 벱니다")

        newid = {pg["id"]: _new_id("wk") for pg in pages}
        title = str(p.get("title") or "").strip() or f"{root['title']} (복사)"

        async with c.transaction():
            # 벤 것은 원본 **바로 뒤**에 세운다 — 맨 끝에 서면 어디 갔는지 찾는다
            await c.execute(
                "UPDATE wiki_page SET ord = ord + 1"
                " WHERE parent_id IS NOT DISTINCT FROM $1 AND project=$2 AND ord > $3",
                root["parent_id"], root["project"], int(root["ord"] or 0),
            )
            for pg in pages:
                body = pg["body"]
                if isinstance(body, str):
                    body = json.loads(body or "[]")
                body = json.loads(json.dumps(body))      # 원본과 끊는다

                # 표를 새로 뜨고 열쇠를 바꿔 끼운다
                nid = newid[pg["id"]]
                mp = {t: _new_id("wt") for t in _wiki_tids(body)}
                for src, dst in mp.items():
                    await _wtbl_clone(c, src, dst, nid)
                if mp:
                    _wiki_swap_tids(body, mp)

                is_root = pg["id"] == root["id"]
                await c.execute(
                    "INSERT INTO wiki_page (id, project, parent_id, title, body, plain, ord,"
                    " created_by, updated_by) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$8)",
                    nid, pg["project"],
                    root["parent_id"] if is_root else newid.get(pg["parent_id"]),
                    title if is_root else pg["title"],
                    json.dumps(body, ensure_ascii=False), _wiki_plain(body),
                    int(root["ord"] or 0) + 1 if is_root else int(pg["ord"] or 0),
                    who,
                )

    try:
        asyncio.create_task(core.broadcast({"type": "wiki_updated", "id": newid[root["id"]], "user": who}))
    except Exception:
        pass
    return {"ok": True, "id": newid[root["id"]], "pages": len(pages)}


@router.patch("/api/wiki/{pid}")
async def wiki_patch(pid: str, payload: dict):
    """자리 옮기기·이름 바꾸기 — 본문은 안 건드린다(지난 판도 안 남긴다)."""
    sets, args = [], []
    for k in ("title", "parent_id", "project", "ord"):
        if k in payload:
            args.append(payload[k])
            sets.append(f"{k}=${len(args)}")
    if not sets:
        return {"ok": True}
    sets.append("updated_at=now()")
    args.append(pid)
    async with db.pool().acquire() as c:
        await _help_guard(c, pid, payload)
        await c.execute(f"UPDATE wiki_page SET {', '.join(sets)} WHERE id=${len(args)}", *args)
    return {"ok": True}


@router.delete("/api/wiki/{pid}")
async def wiki_delete(pid: str):
    """지운다. **아래 문서가 있으면 안 지운다** — 통째로 사라지면 되돌릴 수 없다."""
    async with db.pool().acquire() as c:
        await _help_guard(c, pid)
        kid = await c.fetchval("SELECT count(*) FROM wiki_page WHERE parent_id=$1", pid)
        if kid:
            raise HTTPException(400, f"아래 문서가 {kid}개 있습니다 — 먼저 옮기거나 지우세요")
        await c.execute("DELETE FROM wiki_page WHERE id=$1", pid)
    return {"ok": True}


@router.get("/api/wiki/{pid}/revs")
async def wiki_revs(pid: str, limit: int = 30):
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            "SELECT id, title, who, at FROM wiki_rev WHERE page_id=$1 ORDER BY at DESC LIMIT $2",
            pid, max(1, min(200, limit)),
        )
    return {"revs": [{**dict(r), "at": r["at"].isoformat()} for r in rows]}


@router.get("/api/wiki/rev/{rev_id}")
async def wiki_rev_get(rev_id: int):
    """지난 판 하나. 되돌리려면 그때의 본문이 있어야 한다."""
    async with db.pool().acquire() as c:
        r = await c.fetchrow("SELECT * FROM wiki_rev WHERE id=$1", rev_id)
    if not r:
        raise HTTPException(404, "그 판을 찾을 수 없습니다")
    d = dict(r)
    d["at"] = d["at"].isoformat()
    if isinstance(d.get("body"), str):
        try:
            d["body"] = json.loads(d["body"])
        except Exception:
            d["body"] = []
    return {"rev": d}


# ───────────────────────────────────────────
# Yjs 중계 — 함께 쓰는 위키
# ───────────────────────────────────────────
#
# **서버는 글을 이해하지 않는다.** 방(문서) 하나에 붙은 소켓들 사이에서
# 받은 것을 그대로 옮겨 줄 뿐이다. 글을 맞추는 일(CRDT)과 커서를 나누는
# 일(awareness)은 모두 브라우저의 Yjs 가 한다 — 서버가 문서 꼴을 알면
# 편집기 스키마가 바뀔 때마다 서버도 따라 고쳐야 하고, 그 둘이 어긋나는
# 날 글이 깨진다.
#
# 그래서 늦게 들어온 사람은 **먼저 있던 사람에게서** 문서를 받는다
# (y-websocket 의 sync 규약). 아무도 없던 방은 빈 채로 열리고, 첫 사람이
# DB 에 있던 글로 채운다 — 그 판단도 브라우저가 한다.
_yrooms: dict[str, set[WebSocket]] = {}


@router.get("/api/yjs/peers/{room}")
async def yjs_peers(room: str):
    """방에 지금 몇이 있나 — 문서를 여는 쪽이 「혼자인지」 를 기다려 보지
    않고 바로 안다(지적: 느리다). 중계가 이미 세고 있는 수를 읽을 뿐이다."""
    return {"ok": True, "n": len(_yrooms.get(room) or ())}


@router.websocket("/ws/yjs/{room}")
async def yjs_relay(websocket: WebSocket, room: str):
    await websocket.accept()
    peers = _yrooms.setdefault(room, set())
    peers.add(websocket)
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data is None:
                # y-websocket 은 바이너리로만 말한다. 글자가 오면 흘려보낸다
                continue
            dead = []
            for p in peers:
                if p is websocket:
                    continue
                try:
                    await p.send_bytes(data)
                except Exception:
                    dead.append(p)
            for p in dead:
                peers.discard(p)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        peers.discard(websocket)
        # 마지막 사람이 나가면 방을 접는다 — 안 접으면 빈 방이 쌓인다
        if not peers:
            _yrooms.pop(room, None)


# ══════════════════════════════════════════════════════════════════
# 위키 문서 안의 표 (노션식 데이터베이스)
#
# 문서에는 표의 열쇠만 남고 열·행은 서버에 있다. 그래야 칸 하나를 고칠 때
# 문서 전체가 다시 저장되지 않고, 두 사람이 다른 칸을 고쳐도 서로 안 덮는다.
# ══════════════════════════════════════════════════════════════════
def _wtbl_who(token: str = "") -> str:
    u = core.user_from_token(token) or {}
    return str(u.get("name") or u.get("username") or "") if isinstance(u, dict) else ""


async def _wtbl_ping(tid: str, who: str) -> None:
    """남의 창도 곧바로 따라오게 — 알림 실패가 저장을 되돌리지는 않는다"""
    try:
        await core.broadcast({"type": "wiki_table_updated", "tid": tid, "user": who})
    except Exception:
        pass


@router.get("/api/wiki-table/{tid}")
async def wiki_table_get(tid: str, token: str = ""):
    """표 한 벌. **없으면 그 자리에서 만든다** — 블록이 처음 그려질 때 404 를 안 보게."""
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    head = await db.wtbl_get(tid)
    if head is None:
        await db.wtbl_head(tid, who=_wtbl_who(token))
        head = await db.wtbl_get(tid) or {}
    return {
        "id": tid,
        "title": head.get("title") or "",
        "cols": head.get("cols") or [],
        "calcs": head.get("calcs") or {},
        "view": head.get("view") or {},
        "rows": await db.wtbl_rows(tid),
    }


@router.post("/api/wiki-table/{tid}/head")
async def wiki_table_head(tid: str, payload: dict, token: str = ""):
    """이름·열·집계·보기 — 보낸 것만 고친다(안 보낸 칸은 그대로)."""
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    p = payload or {}
    await db.wtbl_head(
        tid,
        page_id=str(p.get("page_id") or ""),
        title=p.get("title"),
        cols=p.get("cols"),
        calcs=p.get("calcs"),
        view=p.get("view"),
        who=_wtbl_who(token),
    )
    await _wtbl_ping(tid, _wtbl_who(token))
    return {"ok": True}


@router.post("/api/wiki-table/{tid}/cell")
async def wiki_table_cell(tid: str, payload: dict, token: str = ""):
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    p = payload or {}
    rid = str(p.get("rid") or "").strip()
    key = str(p.get("key") or "").strip()
    if not rid or not key:
        raise HTTPException(400, "줄과 칸을 알려 주세요")
    await db.wtbl_cell(tid, rid, key, str(p.get("value") or ""))
    await _wtbl_ping(tid, _wtbl_who(token))
    return {"ok": True}


@router.post("/api/wiki-table/{tid}/rows")
async def wiki_table_rows(tid: str, payload: dict, token: str = ""):
    """줄 더하기({seed}) 또는 차례 바꾸기({order: [rid…]})."""
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    p = payload or {}
    order = p.get("order")
    if isinstance(order, list) and order:
        await db.wtbl_reorder(tid, order)
        await _wtbl_ping(tid, _wtbl_who(token))
        return {"ok": True}
    rid = str(p.get("rid") or "") or f"r{int(_t.time() * 1000)}{_secrets.token_hex(3)}"
    seed = p.get("seed")
    await db.wtbl_row_new(tid, rid, seed if isinstance(seed, dict) else None)
    await _wtbl_ping(tid, _wtbl_who(token))
    return {"ok": True, "rid": rid}


@router.delete("/api/wiki-table/{tid}/rows")
async def wiki_table_rows_del(tid: str, payload: dict, token: str = ""):
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    n = await db.wtbl_row_del(tid, (payload or {}).get("ids") or [])
    await _wtbl_ping(tid, _wtbl_who(token))
    return {"ok": True, "deleted": n}


@router.post("/api/wiki-table/{tid}/import")
async def wiki_table_import(tid: str, payload: dict, token: str = ""):
    """엑셀·노션에서 받은 자료를 통째로 들인다.

    {header: [이름…], rows: [[값…]…], replace: bool, mapping: [{key|label|skip}…]}

    mapping 이 오면 **그것이 정본이다** — 화면의 짝짓기 팝업에서 사람이 고른
    것이다. 안 오면 머리줄 이름으로 맞추고 없는 이름은 열을 새로 만든다.
    """
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    p = payload or {}
    header = [str(x or "") for x in (p.get("header") or [])]
    rows = [list(r) for r in (p.get("rows") or []) if isinstance(r, (list, tuple))]
    if not header:
        raise HTTPException(400, "머리줄(열 이름)이 없습니다")
    if not rows:
        raise HTTPException(400, "들일 줄이 없습니다")
    if len(rows) > 5000:
        raise HTTPException(400, f"한 번에 5000줄까지 들입니다 (받은 것 {len(rows)}줄)")
    mp = p.get("mapping")
    out = await db.wtbl_import(
        tid, header, rows, bool(p.get("replace")),
        mp if isinstance(mp, list) else None,
    )
    await _wtbl_ping(tid, _wtbl_who(token))
    return {"ok": True, **out}
