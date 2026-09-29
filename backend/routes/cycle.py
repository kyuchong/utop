# -*- coding: utf-8 -*-
"""시험 실행 · 사이클 — main.py 에서 글자 그대로 옮겨 왔다(2026-09-28, 분리 5호).

바뀐 것은 셋뿐이다: @app→@router, main 의 이름→core.<이름>(앞 밑줄 뗀 것),
그리고 임포트 머리. 주소는 하나도 안 바뀐다.

이 파일이 대는 길:
  /api/cycle/… · /api/cycle-* · /api/plan-runs/…   사이클·플랜 실행·회차·결과 메일·요약·PPTX
  /api/runs · /api/runner/…                          실행 대기줄(runner 컨테이너가 집어 간다)
  /api/run-cli · /api/run-cli-stream · /api/session-* · /api/cli-complete   장비 CLI 실행(netmiko)·셀 세션
  /api/ping · /api/ping-stream · /api/snmp-* · /api/lab-test                 스텝 실행 도구
  /api/locks/…                                       자원 잠금(장비 점유)
  /api/tc/{id}/run · run-history · cycles · /api/tc-running · /api/tc-last-result   시험 항목 실행 기록
  /api/procedures · /api/run/{proc_id} · /api/results                       옛 시험 절차 실행
  /api/report/summary · /api/notify/cycle                                    집계·알림

판정 규칙은 여기 파이썬 것과 화면·runner 의 judge.ts 두 벌이 아니다 — 자동 실행은
runner.ts 가 판정하고, 여기 _item_verdict 는 저장된 결과를 다시 세는 쪽이다.
"""
import asyncio
import engine
import html as _h
import json
import os
import re
import secrets as _secrets
import threading as _threading
import time as _t
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, Response
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4 as _uuid4

import core
import db
from routes import ai
from routes import devices as dev
from routes import jira

router = APIRouter()


# 플랜 배정 알림 메일 기본 폼 (메일 설정 → 플랜 배정 폼에서 편집 가능)
# 플레이스홀더: {{assignee}} {{model}} {{vgroup}} {{version}} {{period}} {{count}} {{items}} {{app_url}} {{login_button}}
_DEFAULT_CYCLE_SUBJECT = "[ubiQuoss-TOP] 시험 플랜 배정 — {{model}} {{version}}"
# Cycles 알림(지시) — 시험이 끝나면 실행한 사람에게. 제목 자리표는 아래 _done_fill 참고
# 「[UTOP] 사이클명 시험 완료」 꼴(지시). status 는 완료·멈춤·오류 중 하나라 끝난 모양대로 읽힌다
_DONE_SUBJECT = "[UTOP] {{cycle}} 시험 {{status}}"
_DEFAULT_CYCLE_TPL = """<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">
<div style="font-family:'Malgun Gothic','맑은 고딕',Arial,sans-serif;max-width:960px;margin:0 auto;color:#1f2937;">
  <div style="background:linear-gradient(135deg,#2563eb,#4f8ae8);color:#fff;padding:18px 22px;border-radius:11px 11px 0 0;">
    <div style="font-size:18px;font-weight:800;">📋 시험 플랜이 배정되었습니다</div>
    <div style="font-size:12.5px;opacity:.92;margin-top:3px;">{{assignee}} 님, 아래 항목을 시험해 주세요.</div></div>
  <div style="border:1px solid #e3e8ef;border-top:none;border-radius:0 0 11px 11px;padding:20px 22px;">
    <table style="font-size:13px;line-height:1.7;margin-bottom:14px;">
      <tr><td style="color:#6b7280;padding-right:16px;">모델</td><td style="font-weight:700;">{{model}}</td></tr>
      <tr><td style="color:#6b7280;padding-right:16px;">버전 그룹</td><td style="font-weight:700;">{{vgroup}}</td></tr>
      <tr><td style="color:#6b7280;padding-right:16px;">버전</td><td style="font-weight:700;">{{version}}</td></tr>
      <tr><td style="color:#6b7280;padding-right:16px;">시험 기간</td><td>{{period}}</td></tr>
      <tr><td style="color:#6b7280;padding-right:16px;">시험 항목</td><td style="font-weight:700;color:#00875a;">{{count}} 건</td></tr>
    </table>
    <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:6px;">📝 시험 항목 목록</div>
    {{items}}
    {{login_button}}
    <div style="margin-top:16px;font-size:11px;color:#9ca3af;border-top:1px solid #eef0f4;padding-top:10px;">ubiQuoss-TOP 시험 자동화 플랫폼에서 자동 발송된 메일입니다.</div>
  </div>
</div></body></html>"""


@router.post("/api/notify/cycle")
async def api_notify_cycle(payload: dict, token: str = ""):
    """플랜 생성 시 담당자에게 배정 알림 메일 발송 (메일 발송 토글 ON일 때 프론트가 호출)."""
    u = core.user_from_token(token)
    if not u:
        raise HTTPException(401, "로그인이 필요합니다")
    assignee = str(payload.get("assignee") or "").strip()
    if not assignee:
        raise HTTPException(400, "담당자가 없습니다")
    vg = str(payload.get("version_group") or "")
    ver = str(payload.get("version") or "")
    # 담당자 이메일 조회 (이름 또는 아이디 매칭)
    email = ""
    try:
        for x in core.users_load_sync().get("users", []):
            if assignee in (x.get("name"), x.get("username")) and x.get("email"):
                email = x["email"]; break
    except Exception:
        pass
    if not email:
        raise HTTPException(400, f"'{assignee}' 담당자의 이메일을 찾을 수 없습니다")
    _mc = core.load_mail_cfg()
    if not _mc.get("enabled"):
        raise HTTPException(400, "메일 발송이 꺼져 있습니다 (시스템 → 메일 설정)")
    model = str(payload.get("model") or "")
    start = str(payload.get("start") or "")
    end = str(payload.get("end") or "")
    items = payload.get("items") or []
    app_url = str(_mc.get("app_url") or "").rstrip("/")
    import html as _h
    esc = lambda s: _h.escape(str(s or ""))
    # 시험 항목 표
    rows = ""
    for i, it in enumerate(items, 1):
        rows += (f'<tr>'
                 f'<td style="padding:6px 10px;border:1px solid #e3e8ef;text-align:center;color:#6b7280;white-space:nowrap;">{i}</td>'
                 f'<td style="padding:6px 10px;border:1px solid #e3e8ef;font-family:monospace;color:#2563eb;white-space:nowrap;">{esc(it.get("id"))}</td>'
                 f'<td style="padding:6px 10px;border:1px solid #e3e8ef;">{esc(it.get("name"))}</td>'
                 f'</tr>')
    if not rows:
        rows = '<tr><td colspan="3" style="padding:10px;border:1px solid #e3e8ef;color:#9ca3af;text-align:center;">배정된 시험 항목 없음</td></tr>'
    period = (f"{esc(start)} ~ {esc(end)}" if (start or end) else "-")
    # 시험 항목 목록 표 ({{items}} 치환용)
    items_html = ('<table style="border-collapse:collapse;width:100%;font-size:12.5px;">'
        '<thead><tr style="background:#f3f6fb;">'
        '<th style="padding:6px 10px;border:1px solid #e3e8ef;width:36px;">#</th>'
        '<th style="padding:6px 10px;border:1px solid #e3e8ef;text-align:left;width:220px;white-space:nowrap;">TC ID</th>'
        '<th style="padding:6px 10px;border:1px solid #e3e8ef;text-align:left;">시험명</th>'
        f'</tr></thead><tbody>{rows}</tbody></table>')
    # 메일 폼: 설정의 플랜 배정 폼(있으면) → 없으면 기본 폼. 플레이스홀더 치환.
    tpl = _mc.get("cycle_html") or _DEFAULT_CYCLE_TPL
    subj_tpl = _mc.get("cycle_subject") or _DEFAULT_CYCLE_SUBJECT
    def _fill(s):
        s = core.repair_placeholders(s or "")
        s = s.replace("{{assignee}}", esc(assignee)).replace("{{model}}", esc(model or "-"))
        s = s.replace("{{vgroup}}", esc(vg or "-")).replace("{{version}}", esc(ver or "-"))
        s = s.replace("{{period}}", period).replace("{{count}}", str(len(items)))
        s = s.replace("{{items}}", items_html)
        s = s.replace("{{app_url}}", (app_url or "").strip().rstrip("/"))
        s = s.replace("{{login_button}}", (f'<a href="{esc(app_url)}" style="display:inline-block;margin-top:14px;padding:9px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:7px;font-weight:700;">Test Workflow 열기 →</a>' if app_url else ""))
        return s
    subject = _fill(subj_tpl).strip()
    html = _fill(tpl)
    if "<html" not in html.lower():
        html = '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">' + html + '</body></html>'
    if payload.get("preview"):
        return {"ok": True, "preview": True, "to": email, "subject": subject, "html": html}
    try:
        sent = core.send_mail([email], subject, html, html=True)
    except Exception as e:
        raise HTTPException(400, f"발송 실패: {e}")
    return {"ok": True, "sent": sent, "to": email}


# ───────────────────────────────────────────
# 자원 점유 (장비 · 계측기)
#
# 같은 장비를 두 사람이 동시에 잡으면 시험이 통째로 망가진다. 50명이
# 함께 쓰면 반드시 필요하다.
#
# 락은 플랜이 끝날 때까지 유지한다(시간 만료 없음). 자동으로 풀면
# 실제 시험 중인 장비를 남이 뺏을 수 있다. 대신 살아있음 신호를 남겨
# '응답 없음' 을 보여주고, 푸는 것은 사람이 판단한다.
# ───────────────────────────────────────────
class LockIn(BaseModel):
    resource_id: str
    kind: str = "device"          # 'device' | 'instrument'
    cycle_id: Optional[str] = None
    note: Optional[str] = None


@router.get("/api/cycle-desc-template")
async def cycle_desc_template_get():
    """플랜 설명 틀 — 보고서 패턴을 맞추려고 사람이 정의해 둔다."""
    d = core.kv_load_sync("cycle_desc_template", {}) or {}
    return {"text": str(d.get("text") or "")}


@router.post("/api/cycle-desc-template")
async def cycle_desc_template_set(payload: dict):
    core.kv_save_sync("cycle_desc_template", {"text": str(payload.get("text") or "")})
    return {"success": True}


@router.get("/api/locks")
async def list_locks():
    """지금 잡혀 있는 자원 전부. 화면이 '누가 언제부터' 를 보여줄 수 있게
    신호가 끊긴 지 얼마나 됐는지도 함께 준다."""
    async with db.pool().acquire() as c:
        rows = await c.fetch(
            """
            SELECT resource_id, kind, locked_by, locked_name, cycle_id, note,
                   locked_at, heartbeat_at,
                   EXTRACT(EPOCH FROM (now() - heartbeat_at))::int AS stale_sec
            FROM resource_lock ORDER BY locked_at
            """
        )
        # 「어느 플랜에서 쓰는 중인가」 — id 만으로는 사람이 못 읽는다(지시)
        ids = [r["cycle_id"] for r in rows if r["cycle_id"]]
        nm: dict = {}
        if ids:
            cn = await c.fetch(
                "SELECT id, name, data_summary FROM cycle WHERE id = ANY($1::text[])", ids
            )
            for r2 in cn:
                d2 = dict(r2["data_summary"] or {})
                nm[r2["id"]] = {"name": r2["name"], "cid": d2.get("cid") or ""}
    out = []
    for r in rows:
        d = dict(r)
        info = nm.get(d.get("cycle_id") or "")
        d["cycle_name"] = (info or {}).get("name") or ""
        d["cycle_cid"] = (info or {}).get("cid") or ""
        out.append(d)
    return {"locks": out}


class LockBulkIn(BaseModel):
    resource_ids: list[str] = []
    kind: str = "device"
    cycle_id: Optional[str] = None
    note: Optional[str] = None


@router.post("/api/locks/bulk")
async def acquire_locks_bulk(body: LockBulkIn, request: Request):
    """
    플랜 실행이 거는 자동 점유(지시). 걸려는 장비 가운데 **남이 잡은 것이
    하나라도 있으면 아무것도 잡지 않고 물러난다** — 반쯤 잡힌 채로 실패하면
    남의 자리만 붙들고 있게 된다.

    막힌 자리는 「누가 · 어느 플랜에서」 까지 돌려준다.
    """
    me = core.me(request)
    ids = [str(x).strip() for x in (body.resource_ids or []) if str(x).strip()]
    if not ids:
        return {"success": True, "locked": [], "blocked": []}

    async with db.pool().acquire() as c:
        cur = await c.fetch(
            "SELECT * FROM resource_lock WHERE resource_id = ANY($1::text[])", ids
        )
        mine_name = me.get("username")
        blocked = [dict(r) for r in cur if r["locked_by"] != mine_name]
        if blocked:
            cids = [b["cycle_id"] for b in blocked if b["cycle_id"]]
            nm: dict = {}
            if cids:
                cn = await c.fetch("SELECT id, name FROM cycle WHERE id = ANY($1::text[])", cids)
                nm = {r["id"]: r["name"] for r in cn}
            for b in blocked:
                b["cycle_name"] = nm.get(b.get("cycle_id") or "") or ""
                b["locked_at"] = b["locked_at"].isoformat() if b.get("locked_at") else None
                b["heartbeat_at"] = b["heartbeat_at"].isoformat() if b.get("heartbeat_at") else None
            return {"success": False, "locked": [], "blocked": blocked}

        held = {r["resource_id"] for r in cur}
        for rid in ids:
            if rid in held:
                await c.execute(
                    "UPDATE resource_lock SET heartbeat_at=now(), cycle_id=COALESCE($2, cycle_id) "
                    "WHERE resource_id=$1",
                    rid, body.cycle_id,
                )
                continue
            await c.execute(
                """INSERT INTO resource_lock
                   (resource_id, kind, locked_by, locked_name, cycle_id, note)
                   VALUES ($1,$2,$3,$4,$5,$6)""",
                rid, body.kind, mine_name, me.get("name") or mine_name,
                body.cycle_id, body.note,
            )
    return {"success": True, "locked": ids, "blocked": []}


@router.post("/api/locks")
async def acquire_lock(body: LockIn, request: Request):
    rid = (body.resource_id or "").strip()
    if not rid:
        raise HTTPException(400, "자원 id 가 필요합니다")
    me = core.me(request)

    async with db.pool().acquire() as c:
        cur = await c.fetchrow("SELECT * FROM resource_lock WHERE resource_id=$1", rid)
        if cur:
            if cur["locked_by"] != me.get("username"):
                who = cur["locked_name"] or cur["locked_by"]
                since = cur["locked_at"].strftime("%m-%d %H:%M") if cur["locked_at"] else ""
                raise HTTPException(
                    409, f"이미 {who} 님이 잡고 있습니다 (시작 {since}). 확인 후 진행하세요."
                )
            # 내가 이미 잡고 있으면 신호만 갱신한다
            await c.execute(
                "UPDATE resource_lock SET heartbeat_at=now(), cycle_id=COALESCE($2, cycle_id) WHERE resource_id=$1",
                rid, body.cycle_id,
            )
            return {"success": True, "renewed": True}

        await c.execute(
            """INSERT INTO resource_lock
               (resource_id, kind, locked_by, locked_name, cycle_id, note)
               VALUES ($1,$2,$3,$4,$5,$6)""",
            rid, body.kind, me.get("username"), me.get("name") or me.get("username"),
            body.cycle_id, body.note,
        )
    return {"success": True, "renewed": False}


@router.post("/api/locks/{resource_id}/heartbeat")
async def heartbeat_lock(resource_id: str, request: Request):
    me = core.me(request)
    async with db.pool().acquire() as c:
        r = await c.execute(
            "UPDATE resource_lock SET heartbeat_at=now() WHERE resource_id=$1 AND locked_by=$2",
            resource_id, me.get("username"),
        )
    if not r.endswith(" 1"):
        raise HTTPException(404, "내가 잡고 있는 자원이 아닙니다")
    return {"success": True}


@router.delete("/api/locks/{resource_id}")
async def release_lock(resource_id: str, request: Request):
    """해제는 잡은 본인과 관리자만. 남의 시험을 아무나 끊을 수 없어야 한다."""
    me = core.me(request)
    async with db.pool().acquire() as c:
        cur = await c.fetchrow("SELECT * FROM resource_lock WHERE resource_id=$1", resource_id)
        if not cur:
            raise HTTPException(404, "잡혀 있지 않습니다")
        is_admin = me.get("role") == "관리자"
        if cur["locked_by"] != me.get("username") and not is_admin:
            who = cur["locked_name"] or cur["locked_by"]
            raise HTTPException(403, f"{who} 님이 잡은 자원입니다. 본인 또는 관리자만 해제할 수 있습니다.")
        await c.execute("DELETE FROM resource_lock WHERE resource_id=$1", resource_id)
    return {"success": True, "forced": cur["locked_by"] != me.get("username")}


@router.delete("/api/locks/by-cycle/{cycle_id}")
async def release_locks_of_cycle(cycle_id: str, request: Request):
    """플랜이 끝나면 그 플랜이 잡은 것을 한꺼번에 푼다."""
    core.me(request)
    async with db.pool().acquire() as c:
        r = await c.execute("DELETE FROM resource_lock WHERE cycle_id=$1", cycle_id)
    return {"success": True, "released": int(r.rsplit(" ", 1)[-1] or 0)}


_tc_cache = {}   # path_str → {"mtime":..., "full":dict, "meta":dict}
_cycle_cache = {}


@router.get("/api/tc-last-result")
async def tc_last_result():
    """시험마다 **가장 최근 시험 결과** — 목록의 한 열(지시).

    결과는 플랜 안에 산다. 다만 `result` 칸만 보면 안 된다 — 자동 실행은
    항목 칸을 비워 두고 **스텝에만** 결과를 남긴다(사람이 손으로 찍을 때만
    항목 칸이 찬다). 그래서 돌려 놓고도 목록이 「–」 였다(지적: 제대로
    반영되고 있는 건가). 판정은 실행 화면과 같은 규칙(_item_verdict)으로
    스텝에서 유도한다.

    **가장 나중에 돌린 것**이 이긴다 — 플랜을 고친 시각이 아니라 항목을
    실행한 시각(`last_run`)으로 고른다.
    """
    try:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                """
                SELECT id, name, updated_at, data->'items' AS items
                FROM cycle
                ORDER BY updated_at DESC NULLS LAST
                """
            )
    except Exception as e:
        return {"items": {}, "error": str(e)[:200]}
    def _when(v) -> str:
        """시각 문자열을 견줄 수 있는 한 가지 꼴로. 자료에 `2026-06-29 14:53:44`
        와 `2026-06-29T14:53:44` 가 섞여 있어, 그대로 견주면 같은 순간인데도
        T 쪽이 늘 나중으로 읽힌다."""
        return str(v or "")[:19].replace("T", " ")

    best: dict = {}
    for r in rows:
        items = r["items"] if isinstance(r["items"], list) else []
        cyc_at = r["updated_at"].isoformat() if r["updated_at"] else ""
        for it in items:
            if not isinstance(it, dict):
                continue
            t = str(it.get("tcid") or "").strip()
            if not t:
                continue
            v = _item_verdict(it)
            if not v:
                continue        # 아직 안 돌린 항목은 「최근 결과」 가 아니다
            # **언제 돌렸나**로 고른다(지적: 실행했을 때 Pass 인데 안 바뀐다).
            # 여태는 「플랜을 마지막으로 고친 시각」 순으로 앞엣것을 썼다.
            # 그래서 같은 시험이 두 플랜에 들어 있으면, 어제 Pass 로 돌린
            # 것이 아니라 오늘 이름만 고친 플랜의 옛 Fail 이 이겼다. 말풍선의
            # 시각도 실행 시각이 아니라 플랜을 고친 시각이었다.
            at = _when(it.get("last_run")) or _when(cyc_at)
            prev = best.get(t)
            if prev and prev[0] >= at:
                continue
            # 화면 딱지는 설정(실행 판정 기준)의 값 이름을 쓴다 — PASS/FAIL
            # 대문자를 그 이름으로 되돌린다
            label = {"PASS": "Pass", "FAIL": "Fail", "N/A": "진행불가", "BLOCKED": "Blocked"}.get(v, v)
            best[t] = (at, {
                "result": label,
                "cycle_id": str(r["id"] or ""),
                "cycle_name": str(r["name"] or ""),
                "at": str(it.get("last_run") or cyc_at or ""),
            })
    return {"items": {k: val for k, (_, val) in best.items()}}


def _tc_hist_path(tc_id: str) -> Path:
    safe = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in tc_id)
    return core.TC_RUNHIST_DIR / f"{safe}.json"

@router.get("/api/tc/{tc_id}/run-history")
async def get_tc_run_history(tc_id: str):
    tc_id = core.tc_id_norm(tc_id)
    """TC 실행 이력(모든 사용자 통합) 조회."""
    p = _tc_hist_path(tc_id)
    if not p.exists():
        return {"ok": True, "history": []}
    try:
        d = core.load_json(p)
        return {"ok": True, "history": d.get("history", [])}
    except Exception:
        return {"ok": True, "history": []}

@router.post("/api/tc/{tc_id}/run-history")
async def append_tc_run_history(tc_id: str, payload: dict, token: str = ""):
    tc_id = core.tc_id_norm(tc_id)
    """새 실행 이력 1건을 추가. 사용자 이름 자동 태깅. WS로 전 접속자에게 알림."""
    u = core.user_from_token(token) if token else None
    who = (u.get("name") or u.get("username")) if u else ""
    p = _tc_hist_path(tc_id)
    try:
        d = core.load_json(p) if p.exists() else {"history": []}
    except Exception:
        d = {"history": []}
    hist = d.get("history") or []
    entry = payload or {}
    entry["user"] = who or entry.get("user") or ""
    # 각 항목 크기 상한 — log 배열이 너무 크면 최근 5000줄만
    if isinstance(entry.get("log"), list) and len(entry["log"]) > 5000:
        entry["log"] = entry["log"][-5000:]
    hist.insert(0, entry)
    if len(hist) > 100:
        hist = hist[:100]
    d["history"] = hist
    core.save_json(p, d)
    # 다른 접속자에게 새 이력 알림
    try:
        await core.broadcast({"type": "tc_run_history_new", "tcid": tc_id, "at": entry.get("at",""), "user": entry.get("user",""), "pass": entry.get("pass",0), "fail": entry.get("fail",0), "sec": entry.get("sec",0)})
    except Exception:
        pass
    return {"ok": True, "count": len(hist)}

@router.delete("/api/tc/{tc_id}/run-history")
async def delete_tc_run_history(tc_id: str, idx: int = -1):
    tc_id = core.tc_id_norm(tc_id)
    """이력 개별 삭제(idx>=0) 또는 전체 삭제(idx=-1)."""
    p = _tc_hist_path(tc_id)
    if not p.exists():
        return {"ok": True}
    try:
        d = core.load_json(p)
        hist = d.get("history") or []
        if idx < 0:
            hist = []
        elif 0 <= idx < len(hist):
            hist.pop(idx)
        d["history"] = hist
        core.save_json(p, d)
        try:
            await core.broadcast({"type": "tc_run_history_delete", "tcid": tc_id, "idx": idx})
        except Exception:
            pass
        return {"ok": True, "count": len(hist)}
    except Exception as e:
        raise HTTPException(500, str(e))

# 이 TC 를 참조하는 모든 플랜 items 에서 해당 항목 제거 (백그라운드용 헬퍼).
# ⚠️ 반드시 @app.delete 데코레이터 없이 순수 async 함수여야 함 — 데코레이터가 붙으면
#    DELETE /api/tc/{tc_id} 라우팅이 이 헬퍼로 가버려 실제 tc_delete 호출이 안 됨 (버그).
async def _clean_cycle_refs(tc_id: str):
    try:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                """
                SELECT id FROM cycle
                WHERE data->'items' @? ('$[*] ? (@.tcid == "' || $1::text || '")')::jsonpath
                """,
                tc_id,
            )
            for r in rows:
                cid = r["id"]
                cy = await db.cycle_get(cid)
                if not cy: continue
                items = cy.get("items") or []
                cleaned = [it for it in items if (it or {}).get("tcid") != tc_id]
                if len(cleaned) != len(items):
                    cy["items"] = cleaned
                    await db.cycle_upsert(cid, cy)
                    try: asyncio.create_task(core.broadcast({"type": "cycle_updated", "cycle_id": cid}))
                    except Exception: pass
    except Exception:
        pass


# ───────────────────────────────────────────
# 라우터 - TC Cycle 관리
# ───────────────────────────────────────────
def init_cycle_dir():
    core.CYCLE_DIR.mkdir(exist_ok=True)


# ── Netmiko: 실장비 telnet/ssh 접속 ──
def _netmiko_params(p: dict) -> dict:
    protocol = (p.get("protocol") or "telnet").lower()
    try:
        port = int(p.get("port")) if p.get("port") else (22 if protocol == "ssh" else 23)
    except Exception:
        port = 22 if protocol == "ssh" else 23
    device_type = p.get("device_type") or ("cisco_ios" if protocol == "ssh" else "cisco_ios_telnet")
    return {
        "device_type": device_type,
        "host": (p.get("host") or p.get("ip") or "").strip(),
        "port": port,
        "username": p.get("username") or "",
        "password": p.get("password") or "",
        "secret": p.get("secret") or "",
        "timeout": int(p.get("timeout") or 12),
        # 세션 자리 — **접속 열쇠에만** 쓴다(_conn_key). 여태 여기 안 실어서
        # 열쇠의 sess 가 늘 None 이었고, 같은 장비의 세션 열 개가 접속 하나를
        # 나눠 쓰며 차례로 줄을 섰다(지시: 시험 항목의 Session 으로만 접속).
        # netmiko 에는 넘기지 않는다 — _nm_only 가 뺀다.
        "sess": p.get("sess"),
        "fast_cli": True,            # netmiko 내부 지연 최소화 (명령당 ~1초 → ~0.1초)
        "global_delay_factor": 0.5,  # 출력 안정성 (0.1은 출력 잘림 발생)
    }

def _conn_fail_msg(params: dict, err: Exception) -> str:
    """
    접속 실패를 사람이 쓸 수 있게 적는다.

    netmiko 는 「어디에 못 붙었나」 를 맨 끝에 적는다 —
    `Device settings: cisco_ios 220.1.12.3:22`. 그 문장을 앞에서 200자로
    자르고 있었더니 하필 그 줄이 잘려 「cisco_ios 220.1」 만 남았다.
    반토막 주소는 오해를 부른다 — 등록이 잘못된 줄 알고 장비를 뒤진다.

    그래서 **주소를 맨 앞으로 끌어온다.** 뒤엣말은 잘려도 되지만 어디에
    못 붙었는지는 잘리면 안 된다.
    """
    who = f"{params.get('host', '')}:{params.get('port', '')}"
    proto = "telnet" if "telnet" in str(params.get("device_type", "")) else "ssh"
    body = " ".join(str(err).split())
    if len(body) > 300:
        # 가운데를 접는다. 끝에도 쓸 말이 있다.
        body = body[:200] + " … " + body[-80:]
    return f"{proto} {who} 에 붙지 못했습니다 — {body}"


@router.post("/api/lab-test")
def lab_test(payload: dict):
    # tcl(IXIA N2X 계측기): telnet/ssh가 아니라 Tcl 데몬(9001)으로 연결 — N2X 데몬에 ping
    if str(payload.get("protocol", "")).upper() == "TCL":
        server = str(payload.get("host", "") or payload.get("ip", "")).strip()
        label = str(payload.get("username", "")).strip() or "2"   # N2X 계정 = 등록 ID
        if not server:
            return {"ok": False, "status": "실패", "error": "N2X 서버 IP가 없습니다"}
        try:
            res = dev._n2x_send(server, label, "ping")
        except Exception as e:
            return {"ok": False, "status": "실패", "error": "N2X 데몬 오류: " + str(e)[:300]}
        if res and res.get("ok"):
            return {"ok": True, "status": "연결됨", "prompt": "N2X session " + str(res.get("session", "")), "enabled": True}
        return {"ok": False, "status": "실패", "error": "N2X 연결 실패: " + str((res or {}).get("error", ""))[:300]}
    params = _netmiko_params(payload)
    if not params["host"]:
        return {"ok": False, "status": "실패", "error": "IP가 없습니다"}
    try:
        from netmiko import ConnectHandler
        conn = ConnectHandler(**_nm_only(params))
        enabled = False
        try:
            if params.get("secret"):
                conn.enable(); enabled = True
        except Exception:
            pass
        prompt = ""
        try:
            prompt = conn.find_prompt()
        except Exception:
            pass
        conn.disconnect()
        return {"ok": True, "status": "연결됨", "prompt": prompt, "enabled": enabled}
    except Exception as e:
        return {"ok": False, "status": "실패", "error": str(e)[:400]}


# 장비 연결 캐시 (세션 재사용 → 스텝마다 재접속 방지로 성능 향상)
_conn_cache = {}
_conn_cache_lock = _threading.Lock()
_CONN_IDLE_SEC = 180  # 이 시간 이상 idle이면 생존 확인 후 필요 시 재접속

def _conn_key(p):
    """접속 하나를 가리키는 열쇠.

    ★ `sess`(세션 자리 번호)를 넣는다 — 같은 장비에 세션을 열 개 앉히고
      **동시에** 명령을 넣는 시험이 있다(지시). 자리까지 넣지 않으면 접속
      하나를 열이 나눠 쓰느라 차례로 줄을 선다. 안 보내면 예전처럼 하나다.
    """
    return "{}|{}|{}|{}|{}".format(
        p.get("host"), p.get("port"), p.get("device_type"), p.get("username"), p.get("sess"),
    )

def _nm_only(p: dict) -> dict:
    """netmiko 가 아는 것만 — `sess` 처럼 우리끼리 쓰는 열쇠는 뺀다.

    `ConnectHandler(**params)` 에 모르는 키가 섞이면 그 자리에서 터진다.
    """
    return {k: v for k, v in p.items() if k != "sess"}


def _get_conn_entry(params):
    key = _conn_key(params)
    with _conn_cache_lock:
        ent = _conn_cache.get(key)
        if ent is None:
            ent = {"conn": None, "ts": 0.0, "lock": _threading.Lock()}
            _conn_cache[key] = ent
    return ent


def _force_enable(conn, params, ent=None):
    """접속 직후 User EXEC(>)면 무조건 enable(#) 진입 + 페이징 끄기.
    netmiko conn.enable()이 안 먹는 장비(Ericsson-LG/유비쿼스 등) 대비 직접 'enable' 전송.
    ent(커넥션 엔트리) 를 넘기면 'terminal length 0' 은 세션당 1회만 전송(중복 로그 방지)."""
    import re as _re3
    _P = r"[>#]\s*$"
    at_enable = False
    try:
        conn.write_channel("\n")
        try: cur = conn.read_until_pattern(pattern=_P, read_timeout=6, re_flags=_re3.M)
        except Exception: cur = ""
        if cur.rstrip().endswith("#"):
            at_enable = True
        else:
            conn.write_channel("enable\n")
            try: out = conn.read_until_pattern(pattern=r"(assword|[>#]\s*$)", read_timeout=6, re_flags=_re3.M | _re3.I)
            except Exception: out = ""
            if out.rstrip().endswith("#"):
                at_enable = True
            elif _re3.search(r"password|passwd|암호|비밀번호|secret", out, _re3.I):
                pw = str(params.get("secret") or params.get("password") or "")
                conn.write_channel(pw + "\n")
                try: out2 = conn.read_until_pattern(pattern=_P, read_timeout=6, re_flags=_re3.M)
                except Exception: out2 = ""
                if out2.rstrip().endswith("#"):
                    at_enable = True
    except Exception:
        pass
    # 'terminal length 0' 은 enable(#) 진입 후, 세션당 1회만.
    # (스텝마다 _force_enable 이 호출되므로 flag 로 중복 전송 방지 — 로그 스팸 해소 + 성능 개선)
    if at_enable:
        if ent is not None and ent.get("paging_off"):
            return
        try:
            conn.write_channel("terminal length 0\n")
            conn.read_until_pattern(pattern=r"#\s*$", read_timeout=6, re_flags=_re3.M)
            if ent is not None:
                ent["paging_off"] = True
        except Exception:
            pass



# ── 설정 모드 문맥 유지 ────────────────────────────────────────────
#   「한 스텝 = CLI 하나」 로 나누면 `configure terminal` 과 그다음 명령이
#   다른 호출로 갈린다. 그 사이에 장비가 설정 모드에서 빠져나오면(유휴로
#   빠지는 장비가 있다) 다음 명령이 privileged 프롬프트로 나가 `% Invalid
#   input` 이 난다 — 사용자가 실제로 겪었다(2026-08-19).
#
#   그래서 **세션이 설정 문맥을 기억**한다. 보낸 명령을 보고 문맥을 쌓거나
#   비우고, 보내기 직전에 지금 프롬프트가 설정 모드가 아니면 쌓아 둔 문맥을
#   조용히 다시 밟아 준다. 사람이 적은 절차는 그대로 두고, 잃어버린 상태만
#   되돌리는 방식이다.
_CFG_ENTER = re.compile(r"^\s*(do\s+)?(conf(ig(ure)?)?(\s+t(erminal)?)?|vlan\s+database)\s*$", re.I)
_CFG_LEAVE = re.compile(r"^\s*(end|exit|quit)\s*$", re.I)


def _cfg_ctx_keep(conn, ent, cmd):
    """이 명령을 보내기 전에 — 설정 문맥이 풀렸으면 다시 밟는다."""
    ctx = (ent or {}).get("cfg_ctx") or []
    if not ctx:
        return
    try:
        pr = conn.find_prompt() or ""
    except Exception:
        return
    if "(" in pr:        # 이미 (config)# · (config-if)# 안이다
        return
    for c in ctx:        # 잃어버렸다 — 조용히 되밟는다
        try:
            conn.write_channel(c + "\n")
            conn.read_until_pattern(pattern=r"[>#]\s*$", read_timeout=8, re_flags=re.M)
        except Exception:
            return


# 재부팅 명령 — 보내고 나면 다음 진짜 명령에서 강제 재접속한다(지적:
# 부팅 후 첫 CLI 결과가 안 나온다). reload·reboot·halt·boot·restart 류.
_REBOOT_RE = re.compile(r"^(reload|reboot|restart|halt|boot(?:\s|$)|system\s+restart)", re.I)


def _cfg_ctx_note(ent, cmd):
    """보낸 뒤 — 문맥을 쌓거나 비운다."""
    if ent is None:
        return
    c = str(cmd or "").strip()
    if not c:
        return
    # 재부팅 명령이면 표식 — 다음 진짜 명령이 이걸 보고 새 세션으로 붙는다.
    if _REBOOT_RE.match(c):
        ent["reboot_pending"] = True
    ctx = list(ent.get("cfg_ctx") or [])
    if _CFG_LEAVE.match(c):
        ctx = [] if c.lower().startswith("end") else ctx[:-1]
    elif _CFG_ENTER.match(c):
        ctx = [c]
    elif ctx:
        # 설정 모드 안에서 문맥을 더 파고드는 명령(interface·vlan …)만 쌓는다.
        # 값을 바꾸는 명령(shutdown·ip address …)은 쌓지 않는다 — 되밟으면 두 번 걸린다.
        if re.match(r"^(interface|vlan|line|router|policy-map|class-map)\b", c, re.I):
            ctx = ctx + [c]
    ent["cfg_ctx"] = ctx


def _ensure_conn(ent, params, force=False):
    from netmiko import ConnectHandler
    now = _t.time()
    conn = ent.get("conn")
    if conn is not None:
        # 재부팅 뒤 첫 명령(지적: 부팅 후 첫 CLI 결과가 안 나온다) — is_alive 는
        # reload 로 상대가 죽어도 로컬 소켓만 보고 「살았다」 하므로, 죽은
        # 세션에 명령이 나가 빈 응답이 된다. force 면 무조건 끊고 새로 붙는다.
        # 앞 스텝이 Password:·[y/n] 물음에 세워 둔 세션이면(await_pw) **아무것도
        # 채널에 안 쓰고 그대로 쓴다**(지적: 실제 암호가 맞는데 틀렸다고 나온다).
        # netmiko is_alive() 는 SSH 에서 널바이트(\x00)를 채널에 쓰는데, 그 널이
        # Password: 물음에 섞여 암호가 깨진다 — reload 의 짧은 y 는 견뎠지만
        # 셀 암호는 못 견딘다. 방금 그 세션으로 물음을 받았으니 살아 있음이
        # 확실하다.
        if ent.get("await_pw"):
            ent["ts"] = now
            return conn
        if not force and now - ent.get("ts", 0.0) < _CONN_IDLE_SEC:
            try:
                # **프롬프트가 아니라 소켓을 본다.**
                #
                # find_prompt 는 「#」·「>」 를 찾는다. 그런데 `reload` 를 보낸 직후
                # 장비는 `Are you sure? [y/n]` 을 띄우고 답을 기다린다 — 프롬프트가
                # 안 나오니 예외가 나고, **살아 있는 세션을 죽었다고 보고** 새로 잡게
                # 된다. 그러면 바로 다음에 보내는 `y` 가 새 세션으로 가서
                # 「% invalid input」 이 된다(지적: 이어서 입력이 안 된다).
                #
                # is_alive 는 소켓만 본다 — 장비가 무엇을 묻고 있든 상관없다.
                _alive = getattr(conn, "is_alive", None)
                if _alive is None or _alive():
                    ent["ts"] = now
                    return conn
            except Exception:
                pass
        try:
            conn.disconnect()
        except Exception:
            pass
        ent["conn"] = None
        ent["paging_off"] = False   # 재접속 → 새 세션은 paging 다시 꺼야 함
    conn = ConnectHandler(**_nm_only(params))
    ent["paging_off"] = False   # 새 커넥션도 초기화
    ent["cfg_ctx"] = []         # 새 세션은 설정 문맥도 없다
    _force_enable(conn, params, ent)
    ent["conn"] = conn
    ent["ts"] = now
    return conn


def _start_live_pusher(ent, conn, live_key):
    if not live_key: return None
    _slog = getattr(conn, "session_log", None)
    if _slog is None: return None
    # 메인 이벤트 루프 참조 (워커 스레드에서 broadcast 예약용). startup 훅에서 저장한 값 사용.
    _loop = core.MAIN_LOOP
    if _loop is None:
        try: _loop = asyncio.get_event_loop()
        except Exception: _loop = None
    _orig_write = _slog.write
    def _push_bytes(_b):
        if not _b or _loop is None: return
        try:
            if isinstance(_b, (bytes, bytearray)):
                _txt = bytes(_b).decode("utf-8", "replace")
            else:
                _txt = str(_b)
            if not _txt: return
            asyncio.run_coroutine_threadsafe(
                core.broadcast({"type": "cli-live", "live_key": live_key, "chunk": _txt}),
                _loop
            )
        except Exception:
            pass
    def _patched(_data):
        try: _push_bytes(_data)
        except Exception: pass
        return _orig_write(_data)
    try:
        _slog.write = _patched
    except Exception:
        return None
    return (_slog, _orig_write)

def _stop_live_pusher(handle):
    if not handle: return
    try:
        _slog, _orig_write = handle
        try: _slog.write = _orig_write
        except Exception: pass
    except Exception:
        pass

@router.post("/api/run-cli")
def run_cli(payload: dict):
    params = _netmiko_params(payload)
    commands = payload.get("commands") or ([payload["command"]] if payload.get("command") else [])
    if not params["host"]:
        return {"ok": False, "error": "IP가 없습니다", "outputs": []}
    ent = _get_conn_entry(params)
    with ent["lock"]:  # 같은 장비는 순차 (netmiko 비스레드세이프), 다른 장비는 병렬
        try:
            if payload.get("require_session"):
                # iTest 모델: Session Open 으로 열린 세션이 있을 때만 실행 (자동접속 금지)
                # 다만 유휴 정리(_CONN_IDLE_SEC 초과)로 서버 측 conn이 사라진 경우, 프론트의
                # _procSessOpen 은 여전히 세션 있다고 판단하고 있으므로 자동 재접속을 시도.
                # 재접속 실패 시에만 no_session 반환.
                # **살아 있는지 보고 쓴다.**
                #
                # 여태는 `conn` 이 None 이 아니면 그대로 썼다. 그런데 장비가 reload
                # 되면 파이썬 객체는 그대로 남고 **소켓만 죽는다** — None 이 아니므로
                # 확인도 재연결도 없이 바로 보내고, 다음 명령이 23ms 만에
                # 「[Errno 32] Broken pipe」 로 떨어졌다(지적: 원래는 재연결했다).
                #
                # _ensure_conn 이 바로 그 일을 한다: 쉰 지 얼마 안 됐으면 find_prompt
                # 로 살았는지 보고, 죽었거나 오래 쉬었으면 끊고 새로 잡는다.
                _before = ent.get("conn")
                # 재부팅 뒤 첫 진짜 명령이면 강제 재접속(지적: 부팅 후 첫 CLI 결과
                # 가 안 나온다). y/n 답은 재부팅을 일으키는 스텝이라 건드리지 않는다.
                _first_real0 = next((c for c in commands
                                     if str(c or "").strip().lower() not in ("", "y", "yes", "n", "no")), None)
                _force_re0 = bool(ent.get("reboot_pending")) and _first_real0 is not None
                if _force_re0:
                    ent.pop("reboot_pending", None)
                try:
                    conn = _ensure_conn(ent, params, _force_re0)
                except Exception as _re0:
                    return {"ok": False, "error": "세션이 열려 있지 않습니다 — 먼저 Session Open 스텝을 실행하세요 · 자동 재접속 실패: " + _conn_fail_msg(params, _re0), "no_session": True, "outputs": []}
                # 새 연결로 갈아탔으면 화면에 알린다 — 사람이 「왜 설정이 사라졌지」 를
                # 겪지 않게(재접속하면 설정 문맥·paging 이 초기화된다)
                _auto_reconn = conn is not _before
                ent["ts"] = _t.time()
                # enable 확인은 **새로 붙었을 때만** — 스텝마다 부르면 그때 보내는 개행이
                # `reload` 확인(「Are you sure? [y/n]」)을 삼킨다. 새 연결은 _ensure_conn 이
                # 이미 enable 을 마치고 돌려준다.
                if _auto_reconn:
                    payload["_auto_reconn_notice"] = True
            else:
                conn = _ensure_conn(ent, params)
            repeat = max(1, int(payload.get("repeat", 1) or 1))
            interval = float(payload.get("interval", 1) or 1)
            try:
                # 명령 사이 지연 — **100ms 로 되돌린다**(지적: 편차가 크다).
                #
                # 0 으로 걷었더니 반복 50 회에서 8~19 초짜리 튐이 섞였다.
                # 그 시간대는 **장비 재접속**(conn 10 + banner 15 + auth 10)과
                # 겹친다 — 쉼 없이 쏘면 장비가 못 따라와 세션을 끊는다.
                # iTest 가 100ms 를 두는 까닭이 이것이다(지시).
                # 조회 명령의 tail_wait 0 은 그대로라, 걷어서 얻은 속도는 지킨다.
                cmd_delay = max(0.0, float(payload.get("cmd_delay", 100) or 0) / 1000.0)
            except Exception:
                cmd_delay = 0.1
            try:
                # 명령 뒤 **비동기 로그 수집** 상한 — 기본 0(지시: 지연을 제거).
                # 0 이면 아래 수집 루프를 통째로 건너뛴다. 예전 기본 2.0 은 상한일
                # 뿐이었지만, 출력이 없어도 0.12 초 × 2 회(0.24 초)는 늘 나갔다.
                # reload 처럼 늦게 더 뱉는 명령은 스텝의 「명령 뒤 대기」 로 올린다.
                _tail_max = max(0.0, float(payload.get("tail_wait", 0) or 0))
            except Exception:
                _tail_max = 0.0
            _live_key = payload.get("live_key") or ""   # 있으면 send_command 대신 _exec_streaming 사용 → WS 로 chunk push
            # Completion Wait (스텝 옵션): >0 이면 이 스텝의 모든 명령은 send_command(=프롬프트 대기)를
            # 쓰지 않고 write_channel 로 명령을 쓰고 지정 초 동안 응답만 수집한다. 세션은 [y/n] 등
            # 대기 상태를 유지한 채 반환되며, 다음 스텝 명령(y/n)이 그 위치에 바로 이어져 입력된다.
            try:
                _wait_only_sec = max(0.0, float(payload.get("wait_only_sec", 0) or 0))
            except Exception:
                _wait_only_sec = 0.0
            # 프롬프트까지 기다려 읽기 (빠른 연속 전송에도 출력 온전히 — 출력 누락 방지)
            import re as _re
            # 첫 명령이 y/n 답이면(지적: y 가 안 먹음) 세션이 [y/n] 확인에 서
            # 있다 — find_prompt(개행)를 보내면 그 개행이 확인을 삼킨다.
            _first_yn = bool(commands) and str(commands[0] or "").strip().lower() in ("y", "yes", "n", "no")
            try:
                # 프롬프트는 캐시(연결 시점) 대신 항상 재탐지 — 시험 중 hostname 변경 시
                # 옛 프롬프트를 기다리다 read_timeout(약 25초)을 까먹는 지연을 방지
                # 호스트명만 추출(config 모드 괄호 제거) → enable/config/config-if 어느 레벨이든 매칭되게
                _bp = ""
                if not _first_yn:
                    try: _bp = (conn.find_prompt() or "").strip().rstrip("#>$ ").split("(")[0].strip()
                    except Exception: _bp = ""
                if not _bp:
                    _bp = (getattr(conn, "base_prompt", "") or "").strip().rstrip("#>$ ").split("(")[0].strip()
            except Exception:
                _bp = ""
            # 확인 프롬프트(continue ...? [y/n]: 등)도 함께 매칭 — 장비가 y/n 응답을 기다리며
            # #/> 로 끝나지 않는 줄에서 멈추는 경우, 원래 프롬프트를 못 만나 read_timeout까지
            # 불필요하게 기다리거나 다음 명령(yes/no)이 엉뚱한 타이밍에 꼬여 들어가는 문제 방지.
            _confirm_pat = r"\(y/n\)|\[y/n\]|\(yes/no\)|\[yes/no\]"
            _expect = (r"(?:" + _re.escape(_bp) + r"\S*[#>]\s*$" + r"|" + _confirm_pat + r")") if _bp else None
            _yn_re = _re.compile(_confirm_pat, _re.IGNORECASE)
            _lb = ent.get("log_buf"); _lstart = len(_lb.getvalue()) if _lb else 0
            outputs = []
            _skip_next = False   # 확인 프롬프트에 자동응답한 다음 명령(yes/no 그 자체)은 건너뜀 — 중복 전송 방지
            for _ci, cmd in enumerate(commands):
                # 스텝을 나눠 보내면 그 사이 설정 모드가 풀릴 수 있다 — 되밟는다(지시).
                # 단 y/n 답·직전 Password: 답 명령은 건너뛴다(지적) — 되밟기의
                # find_prompt(개행)가 확인/암호 물음을 삼킨다.
                _after_pw0 = bool(ent.pop("await_pw", False))
                _c0 = str(cmd or "").strip().lower()
                if not _after_pw0 and _c0 not in ("y", "yes", "n", "no") and not re.match(r"^\^c(?:\s|$)", _c0):
                    _cfg_ctx_keep(conn, ent, cmd)
                _cfg_ctx_note(ent, cmd)
                if _skip_next:
                    _skip_next = False
                    continue
                if _ci > 0 and cmd_delay > 0:
                    _t.sleep(min(cmd_delay, 5))
                iters = []
                for k in range(repeat):
                    if k > 0 and interval > 0:
                        _t.sleep(min(interval, 60))
                    # ① 전송 직전: 직전 idle/대기 동안 장비가 밀어낸 잔여 출력(syslog·재표시 프롬프트)을 회수(보존).
                    #    안 비우면 그 끝 프롬프트에 send_command가 즉시 매칭돼 "첫 명령 빈 결과(off-by-one)"가 됨.
                    _pre = ""
                    try:
                        _pre = conn.read_channel() or ""
                    except Exception:
                        _pre = ""
                    # ② 명령 전송 + 프롬프트까지 읽기
                    # Completion Wait On(_wait_only_sec>0): 프롬프트를 기다리지 않는다. write_channel로
                    # 명령만 보내고 지정 초 동안 응답 수집. [y/n] 프롬프트가 뜬 채 반환되고 세션은 그
                    # 상태로 유지 → 다음 스텝 명령(y/n)이 [y/n]: 위치에 바로 이어져 입력된다.
                    # 단일 y/yes/n/no 명령은 직전에 [y/n]이 있었을 가능성 → send_command 대신 write_channel + 3초 대기.
                    _cmd_stripped_pre = (cmd or "").strip().lower()
                    _is_yn_only = _cmd_stripped_pre in ("y", "yes", "n", "no")
                    # `^C` 명령 줄(지시: ping 멈춤) — Ctrl+C(\x03) 를 개행 없이 보낸다
                    _is_break = bool(_re.match(r"^\^c(?:\s+\d+(?:\.\d+)?)?$", _cmd_stripped_pre))
                    try:
                        if _is_break:
                            conn.write_channel("\x03")
                            _bk_buf = ""; _bk_dl = _t.time() + 8.0; _bk_tail = ""
                            while _t.time() < _bk_dl:
                                try: _cbk = conn.read_channel() or ""
                                except Exception: _cbk = ""
                                if _cbk:
                                    _bk_buf += _cbk
                                    _bk_tail = (_bk_tail + _cbk)[-160:]
                                    if _re.search(r"[#>$]\s*$", _bk_tail.strip()):
                                        _t.sleep(0.25)
                                        try: _bk_buf += conn.read_channel() or ""
                                        except Exception: pass
                                        break
                                else:
                                    _t.sleep(0.08)
                            out = "^C\n" + _bk_buf.strip()
                        elif _wait_only_sec > 0:
                            try:
                                conn.write_channel(cmd + "\n")
                            except Exception as ce_wr:
                                raise ce_wr
                            _wo_buf = ""
                            _dl_wo = _t.time() + min(_wait_only_sec, 600.0)
                            while _t.time() < _dl_wo:
                                try: _ch_wo = conn.read_channel() or ""
                                except Exception: _ch_wo = ""
                                if _ch_wo:
                                    _wo_buf += _ch_wo
                                _t.sleep(0.1)
                            out = _wo_buf.rstrip("\r\n")
                            if not out: out = "[정보] " + cmd + " 전송됨 (Completion Wait " + str(int(_wait_only_sec)) + "s 대기, 응답 없음)"
                        elif _is_yn_only:
                            try:
                                conn.write_channel(cmd + "\n")
                            except Exception as ce_wr:
                                raise ce_wr
                            # y/n 후 응답 수집: 총 상한 6초 내에서, 새 프롬프트(#/>/[y/n]:) 감지되면 조기 종료.
                            # config 저장 확인 등 순차 확인 프롬프트(Save to ...cfg? [y/n]:) 도 수집해야 함.
                            _yn_wait = ""
                            _yn_max = 6.0
                            _yn_quiet = 0.6   # 마지막 데이터 후 조용한 시간 이내에 새 프롬프트 못 만나면 종료
                            _yn_start = _t.time()
                            _yn_last_data = _yn_start
                            _yn_prompt_re = _re.compile(r"(\(y/n\)|\[y/n\]|\(yes/no\)|\[yes/no\])\s*:?\s*$", _re.IGNORECASE|_re.MULTILINE)
                            _yn_end_prompt_re = _re.compile(r"[#>]\s*$", _re.MULTILINE)
                            while (_t.time() - _yn_start) < _yn_max:
                                try: _ch_yw = conn.read_channel() or ""
                                except Exception: _ch_yw = ""
                                if _ch_yw:
                                    _yn_wait += _ch_yw
                                    _yn_last_data = _t.time()
                                    # 새 확인 프롬프트나 일반 프롬프트 감지 → 잠깐 여유(0.3s) 두고 종료
                                    _tail_seg = _yn_wait[-80:]
                                    if _yn_prompt_re.search(_tail_seg) or _yn_end_prompt_re.search(_tail_seg):
                                        _t.sleep(0.3)
                                        try: _extra = conn.read_channel() or ""
                                        except Exception: _extra = ""
                                        if _extra: _yn_wait += _extra
                                        break
                                else:
                                    # 조용한 시간이 지속되면 종료
                                    if (_t.time() - _yn_last_data) >= _yn_quiet and _yn_wait.strip():
                                        break
                                    _t.sleep(0.1)
                            out = _yn_wait.strip()
                            if not out: out = "[정보] " + cmd + " 전송됨 (응답 수집 없음 — 재부팅/즉시명령 등)"
                        elif _expect:
                            _lph = _start_live_pusher(ent, conn, _live_key) if _live_key else None
                            try:
                                out = conn.send_command(cmd, expect_string=_expect, read_timeout=25, cmd_verify=False)
                            finally:
                                _stop_live_pusher(_lph)
                        else:
                            _lph = _start_live_pusher(ent, conn, _live_key) if _live_key else None
                            try:
                                out = conn.send_command(cmd, read_timeout=25, cmd_verify=False)
                            finally:
                                _stop_live_pusher(_lph)
                    except Exception as ce:
                        _emsg = str(ce); out = None
                        # 연결 자체가 끊긴 경우(소켓 강제종료 등) — 명령이 장비에 도달했는지 알 수 없으므로
                        # 재연결 후 동일 명령을 1회 재시도. 재연결도 실패하면 이후 스텝은 실행해도 전부
                        # 실패하므로(죽은 세션에 계속 송신하며 거짓 "완료"가 찍히는 문제) 여기서 확정 실패 처리.
                        _emsg_low = _emsg.lower()
                        _connlost = (
                            isinstance(ce, (OSError, EOFError))
                            or "winerror" in _emsg_low
                            or "not connected" in _emsg_low
                            or ("connection" in _emsg_low and "pattern" not in _emsg_low)
                        )
                        if _connlost:
                            try:
                                try: conn.disconnect()
                                except Exception: pass
                                ent["conn"] = None
                                conn = _ensure_conn(ent, params)
                                if payload.get("require_session"):
                                    _force_enable(conn, params, ent)
                                try:
                                    _bp3 = (conn.find_prompt() or "").strip().rstrip("#>$ ").split("(")[0].strip()
                                    if _bp3: _bp = _bp3; _expect = _re.escape(_bp3) + r"\S*[#>]\s*$"
                                except Exception: pass
                                if _expect:
                                    _lph2 = _start_live_pusher(ent, conn, _live_key) if _live_key else None
                                    try:
                                        out = conn.send_command(cmd, expect_string=_expect, read_timeout=25, cmd_verify=False)
                                    finally:
                                        _stop_live_pusher(_lph2)
                                else:
                                    _lph2 = _start_live_pusher(ent, conn, _live_key) if _live_key else None
                                    try:
                                        out = conn.send_command(cmd, read_timeout=25, cmd_verify=False)
                                    finally:
                                        _stop_live_pusher(_lph2)
                                # 재접속 후 재실행 성공 — 사용자 로그에 알림 노이즈 없이 결과만 그대로 반환
                            except Exception as ce3:
                                out = "[실패] 연결이 끊어졌고 재접속도 실패했습니다: " + str(ce3)
                        # 프롬프트 미검출이어도 명령은 이미 실행됨 → 재전송 금지!
                        # (exit 등 상태변경 명령을 중복 전송하면 모드 이탈·로그아웃 위험)
                        # 버퍼에 남은 출력만 회수하고, 다음 명령용 프롬프트(호스트명)만 갱신.
                        elif "Pattern not detected" in _emsg or "pattern not" in _emsg.lower():
                            try:
                                _acc = ""
                                for _rr in range(10):
                                    _ch = ""
                                    try: _ch = conn.read_channel() or ""
                                    except Exception: _ch = ""
                                    if _ch: _acc += _ch
                                    else: _t.sleep(0.2)
                                out = _acc.strip()
                                try:
                                    _bp3 = (conn.find_prompt() or "").strip().rstrip("#>$ ").split("(")[0].strip()
                                    if _bp3: _bp = _bp3; _expect = _re.escape(_bp3) + r"\S*[#>]\s*$"
                                except Exception: pass
                                if not out: out = "[경고] 프롬프트 미검출 — 출력 일부만 수집됨(재전송 안 함)"
                            except Exception as ce2:
                                out = "[ERROR] " + str(ce2)
                        if out is None:
                            out = "[ERROR] " + _emsg
                    # ②-b 확인 프롬프트(continue...? [y/n]:) 정책:
                    # 백엔드는 자동응답 하지 않는다. [y/n]은 _expect 정규식에 포함되어 있어
                    # send_command가 [y/n]을 만나면 즉시 정상 반환한다. 다음 응답(y/n)은 사용자가 UI에서
                    # 명시적으로 다음 Step에 넣어야 한다. reload는 "Save to ...cfg? [y/n]" 등 여러
                    # 프롬프트가 나올 수 있어 자동 y가 위험(구성 저장 등 부작용) → 사용자가 명령으로 통제.
                    # 스텝 사이 지연으로 장비가 [y/n] 취소하는 문제는 스텝별 "Completion Wait"
                    # (프롬프트 대기) 기능으로 해결한다.
                    # ③ SecureCRT식: 명령 직후 장비가 비동기로 흘리는 로그(reboot의 dying-gasp 등)를
                    #    조용해질 때까지(연속 무출력) 추가 수집 → 콘솔에서 직접 친 것과 동일하게 결과에 포함.
                    _tail = ""
                    if _tail_max > 0:
                        try:
                            _idle = 0
                            _dl = _t.time() + _tail_max
                            while _t.time() < _dl:
                                _t.sleep(0.12)
                                _ch = conn.read_channel() or ""
                                if _ch:
                                    _tail += _ch
                                    _idle = 0
                                else:
                                    _idle += 1
                                    if _idle >= 2:  # 약 0.24s 무출력이면 종료
                                        break
                        except Exception:
                            _tail = ""
                    # 비동기 출력 보존: 직전 잔여(_pre)는 앞, 직후 로그(_tail)는 뒤에 붙여 콘솔처럼 그대로 노출
                    if _pre.strip():
                        out = _pre.rstrip("\r\n") + "\n" + out
                    if _tail.strip():
                        out = out.rstrip("\r\n") + "\n" + _tail.rstrip("\r\n")
                    # 명령 에코 중복 제거: 같은 명령줄이 2번 이상 나오면(텔넷 이중 에코·_pre 잔여) 첫 1줄만 남김
                    _cs = (cmd or "").strip()
                    if _cs and out:
                        _ol = out.split("\n"); _dd2 = []; _ne = 0
                        for _ln in _ol:
                            if _ln.strip() == _cs:
                                _ne += 1
                                if _ne > 1:
                                    continue
                            _dd2.append(_ln)
                        out = "\n".join(_dd2)
                    iters.append({"output": out, "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})
                entry = {"command": cmd, "output": iters[-1]["output"], "at": iters[-1]["at"]}
                if repeat > 1:
                    entry["iterations"] = iters
                outputs.append(entry)
            # 자동 재접속(유휴 정리로 conn 손실 후 복구)해도 사용자 로그는 깨끗하게 — 알림 노이즈 없이 결과만 반환
            ent["ts"] = _t.time()  # 세션 유지(재사용)
            _transcript = ""
            if _lb is not None:
                try:
                    _transcript = _lb.getvalue()[_lstart:].decode("utf-8", "replace")
                    _pw0 = params.get("password") or ""
                    if _pw0:
                        _transcript = _transcript.replace(_pw0, "********")
                    _lb.seek(0); _lb.truncate(0)  # 버퍼 비움 → 세션 길어도 메모리 누적 없음
                except Exception:
                    _transcript = ""
            return {"ok": True, "outputs": outputs, "transcript": _transcript}
        except Exception as e:
            try:
                if ent.get("conn"):
                    ent["conn"].disconnect()
            except Exception:
                pass
            ent["conn"] = None
            return {"ok": False, "error": str(e)[:400], "outputs": []}

@router.post("/api/run-cli-stream")
async def run_cli_stream(payload: dict):
    """명령 출력을 줄 단위로 실시간(SSE) 전송 — 블로킹 대신 스트리밍. 명령 에코·끝 프롬프트는 빼고 출력만.
    async generator 로 매 yield 마다 즉시 client 로 flush 되도록 함 (sync generator 는 threadpool 배치 이슈).
    netmiko 호출은 blocking → 짧은 chunk 사이마다 asyncio.sleep(0) 으로 이벤트 루프 양보."""
    from fastapi.responses import StreamingResponse
    import json as _jstr, re as _restr, time as _tstr
    params = _netmiko_params(payload)
    commands = payload.get("commands") or ([payload["command"]] if payload.get("command") else [])
    host_ok = bool(params["host"])
    ent = _get_conn_entry(params) if host_ok else None
    # 프롬프트가 온 뒤에도 얼마나 더 기다릴 것인가.
    #
    # 프롬프트 뒤에 늦게 올라오는 syslog 를 놓치지 않으려는 대기다. 2.0 → 0.3 →
    # **0**(지시: 지연을 제거). 프롬프트가 왔다는 것은 그 명령이 끝났다는 뜻이라,
    # 조회 명령에는 이 대기가 통째로 낭비였다. syslog 를 받아야 하는 명령만
    # 스텝의 「명령 뒤 대기」 를 올린다 — 뭔가 오면 거기서 다시 연장되므로
    # 짧게 잡아도 놓치지 않는다.
    try:
        _quiet_wait = min(30.0, max(0.0, float(payload.get("tail_wait", 0) or 0)))
    except Exception:
        _quiet_wait = 0.0
    # 셀 진입 스텝(지시) — 명령 뒤 Password: 물음에 이 암호를 보내고 셀
    # 프롬프트로 넘어간다. 비우면 장비 접속 암호를 쓴다.
    _shell_enter = bool(payload.get("shell_enter"))
    _shell_pw = str(payload.get("shell_pw") or "").strip() or str(params.get("password") or "")
    def _sse(obj):
        return "data: " + _jstr.dumps(obj, ensure_ascii=False) + "\n\n"
    async def _gen():
        if not host_ok:
            yield _sse({"err": "IP가 없습니다"}); yield _sse({"done": True}); return
        # 이 장비 세션 락을 **이벤트 루프를 막지 않고** 잡는다. 동기 `with` 로
        # 잡으면, 앞 스트림이 안 풀어 둔 락을 다음 호출이 기다리며 **API 전체가
        # 언다** — health 까지 죽는다(실사고: run-cli-stream 하나가 걸리자 서버가
        # 통째로 「로딩중」). 논블로킹 시도 + await sleep 로 잡고, 오래 못 잡으면
        # 비켜 준다. finally 로 반드시 푼다(스트림이 중간에 끊겨도).
        _lk_got = False
        _lk_dl = _t.time() + 20
        while not ent["lock"].acquire(blocking=False):
            await asyncio.sleep(0.05)
            if _t.time() > _lk_dl:
                yield _sse({"err": "이 장비 세션이 다른 실행에 잡혀 있습니다 — 잠시 뒤 다시 시도하세요"}); yield _sse({"done": True}); return
        _lk_got = True
        try:
            try:
                # netmiko 는 **블로킹**이다. 접속·enable·프롬프트 찾기를 async 안에서
                # 그대로 부르면, 그 몇 초 동안 **이벤트 루프 전체가 선다** — 같은
                # 반복의 SNMP 도, 남의 요청도, health 까지 멎는다(지적: 반복이 많은
                # 시험이 엄청 느리거나 멈춘다). 48회 반복이면 그 멈춤이 48번 쌓인다.
                # 스레드로 밀어내면 기다리는 동안에도 서버는 계속 돈다.
                # **살아 있는지 보고 쓴다** — 세션을 쓰는 길도 마찬가지다.
                #
                # 여태는 `conn` 이 None 이 아니면 그대로 썼다. 장비를 reload 하면
                # 파이썬 객체는 그대로 남고 **소켓만 죽는다.** None 이 아니므로
                # _ensure_conn 의 생존 확인(find_prompt)과 유휴 재접속이 통째로
                # 건너뛰어지고, 아래 write_channel 이 23ms 만에
                # 「[Errno 32] Broken pipe」 로 떨어졌다(지적: 원래는 재연결했다).
                #
                # 두 길이 **같은 함수**를 쓰게 한다 — 규칙이 두 벌이면 한쪽만 고쳐진다.
                _before_s = ent.get("conn")
                # 재부팅 뒤 첫 **진짜 명령**이면 강제 재접속(지적: 부팅 후 첫 CLI
                # 결과가 안 나온다). y/n 답은 재부팅을 「일으키는」 스텝이라
                # 아직 옛 세션이 물음에 서 있다 — 그건 건드리지 않는다.
                _first_real = next((c for c in commands
                                    if str(c or "").strip().lower() not in ("", "y", "yes", "n", "no")), None)
                _force_re = bool(ent.get("reboot_pending")) and _first_real is not None
                if _force_re:
                    ent.pop("reboot_pending", None)
                try:
                    conn = await asyncio.to_thread(_ensure_conn, ent, params, _force_re)
                except Exception as _re0s:
                    yield _sse({"err": "세션이 열려 있지 않습니다 — 자동 재접속 실패: " + _conn_fail_msg(params, _re0s)}); yield _sse({"done": True}); return
                ent["ts"] = _t.time()
                if conn is not _before_s:
                    # **새로 붙었을 때만** enable 을 확인한다.
                    #
                    # 여태는 스텝마다 불렀다. 그런데 _force_enable 은 먼저 개행을 보내고
                    # 프롬프트를 기다리다 못 찾으면 `enable` 을 쏜다 — `reload` 뒤
                    # 「Are you sure? [y/n]」 을 기다리는 중이면 그 개행이 확인을 삼키고
                    # `enable` 이 답으로 들어가, 이어서 보낸 `y` 가 「% invalid input」
                    # 이 된다(지적: 한 스텝에 reload·y 를 함께 쓰면 되는데 스텝을 나누면
                    # 안 된다 — 나누면 그 사이에 이것이 끼어들기 때문이다).
                    #
                    # 새 연결은 _ensure_conn 이 이미 enable 을 마치고 돌려주므로 여기서
                    # 또 부를 일도 없다. 남겨 두는 것은 쓰던 세션이 아닌지 가리는 뜻뿐이다.
                    if _before_s is not None:
                        yield _sse({"note": "연결이 끊겨 있어 다시 붙었습니다"})
                ent["ts"] = _t.time()
                bp = (getattr(conn, "base_prompt", "") or "").strip().rstrip("#>$ ").split("(")[0].strip()
                if not bp:
                    try:
                        _fp = await asyncio.to_thread(conn.find_prompt)
                        bp = (_fp or "").strip().rstrip("#>$ ").split("(")[0].strip()
                    except Exception: bp = ""
                # 셀($) 프롬프트도 프롬프트로 본다(지시: 셀 진입 뒤 다음 스텝).
                # 장비 이름(bp)으로 시작하는 줄에만 걸려 오탐이 드물다.
                pr = (_restr.escape(bp) + r"\S*[#>$]\s*$") if bp else None
                # ── Ctrl+C(지시: ping 을 5초 뒤 멈춤) ─────────────────────
                # `^C` 명령 줄 = Ctrl+C(\x03) 를 보낸다. ping 처럼 안 끝나는
                # 명령은 **다음 줄에 `^C 5`** 라 적는다 — 앞 명령을 프롬프트
                # 대기 없이 5초(숫자 생략 시 5) 흘려보내고 끊은 뒤 프롬프트를
                # 되찾는다. 홀로 선 `^C` 는 그 자리에서 바로 끊는다.
                _BRK = _restr.compile(r"^\^c(?:\s+(\d+(?:\.\d+)?))?$", _restr.I)

                async def _read_back_prompt(max_s=8.0):
                    """\x03 뒤 프롬프트가 돌아올 때까지 읽어 흘린다."""
                    _t0b = _tstr.time(); _tailb = ""
                    while _tstr.time() - _t0b < max_s:
                        try: _cb = conn.read_channel() or ""
                        except Exception: _cb = ""
                        if _cb:
                            _tailb = (_tailb + _cb)[-160:]
                            yield _cb
                            if _restr.search(r"[#>$]\s*$", _tailb.strip()):
                                await asyncio.sleep(0.25)
                                try: _cb2 = conn.read_channel() or ""
                                except Exception: _cb2 = ""
                                if _cb2: yield _cb2
                                break
                        else:
                            await asyncio.sleep(0.08)

                _consumed_ci = set()
                for _ci2, cmd in enumerate(commands):
                    if _ci2 in _consumed_ci:
                        continue
                    yield _sse({"cmd": cmd})       # 명령 입력 표시(라이브 터미널에 '$ cmd')

                    # 홀로 선 ^C — 지금 도는 것을 끊는다
                    if _BRK.match(str(cmd or "").strip()):
                        await asyncio.to_thread(conn.write_channel, "\x03")
                        yield _sse({"o": "^C\n"})
                        async for _ob in _read_back_prompt():
                            yield _sse({"o": _ob}); await asyncio.sleep(0)
                        ent["ts"] = _t.time()
                        continue
                    # 다음 줄이 ^C — 이 명령은 프롬프트를 기다리지 않고
                    # 지정 초만 흘려보낸 뒤 끊는다 (ping · 연속 조회)
                    _mnx = _BRK.match(str(commands[_ci2 + 1] or "").strip()) if _ci2 + 1 < len(commands) else None
                    if _mnx:
                        _consumed_ci.add(_ci2 + 1)
                        _run_s = min(600.0, float(_mnx.group(1) or 5))
                        try: await asyncio.to_thread(conn.read_channel)
                        except Exception: pass
                        await asyncio.to_thread(conn.write_channel, cmd + "\n")
                        _cfg_ctx_note(ent, cmd)
                        _dl_r = _tstr.time() + _run_s
                        while _tstr.time() < _dl_r:
                            try: _cr = conn.read_channel() or ""
                            except Exception: _cr = ""
                            if _cr:
                                yield _sse({"o": _cr}); await asyncio.sleep(0)
                            else:
                                await asyncio.sleep(0.08)
                        await asyncio.to_thread(conn.write_channel, "\x03")
                        yield _sse({"o": "^C\n"})
                        async for _ob in _read_back_prompt():
                            yield _sse({"o": _ob}); await asyncio.sleep(0)
                        ent["ts"] = _t.time()
                        continue

                    # ── 셀 진입(지시) — 대화형 암호 처리 ──────────────────
                    # 「start-shell → Password: → 암호 → 셀 프롬프트」. 여기서
                    # _cfg_ctx_keep(개행을 먼저 쏘는 부분)를 지나면 그 개행이
                    # Password: 물음에 빈 암호로 들어가 "Password incorrect" 가
                    # 된다(진단). 그래서 셀 진입은 이 갈래가 통째로 맡는다.
                    if _shell_enter:
                        try: await asyncio.to_thread(conn.read_channel)
                        except Exception: pass
                        await asyncio.to_thread(conn.write_channel, cmd + "\n")
                        _acc = ""; _sent_pw = False; _sh_dl = _tstr.time() + 30
                        while _tstr.time() < _sh_dl:
                            try: _c = conn.read_channel() or ""
                            except Exception: _c = ""
                            if _c:
                                _acc += _c
                                if _c.strip():
                                    yield _sse({"o": _c}); await asyncio.sleep(0)
                                # Password: 물음이 오면 한 번만 암호를 보낸다
                                if (not _sent_pw) and _restr.search(r"pass\s*word\s*:?\s*$", _acc, _restr.I):
                                    _sent_pw = True
                                    await asyncio.to_thread(conn.write_channel, _shell_pw + "\n")
                                    _acc = ""      # 물음 뒤부터 다시 본다
                                    await asyncio.sleep(0.2)
                                    continue
                                # 암호를 보낸 뒤 셀 프롬프트($·#·>)가 안정되면 끝
                                if _sent_pw:
                                    _tail = _acc.split("\n")[-1].strip()
                                    if _tail and _restr.search(r"[#>$]\s*$", _tail):
                                        break
                                # 암호가 필요 없는 셀(바로 프롬프트)도 있다
                                elif _restr.search(r"[#>$]\s*$", _acc.split("\n")[-1].strip()) and cmd.strip() not in _acc.split("\n")[-1]:
                                    break
                            else:
                                await asyncio.sleep(0.05)
                        # 셀 프롬프트로 갈아탄다 — 다음 스텝부터 이 프롬프트를 쓴다.
                        # cfg 문맥은 셀에서 뜻이 없으니 비운다.
                        try:
                            _np = await asyncio.to_thread(conn.find_prompt)
                            if _np:
                                conn.base_prompt = _np.strip().rstrip("#>$ ").split("(")[0].strip()
                                bp = conn.base_prompt
                                pr = (_restr.escape(bp) + r"\S*[#>$]\s*$") if bp else pr
                        except Exception: pass
                        ent["cfg_ctx"] = []
                        ent["ts"] = _t.time()
                        yield _sse({"pr": (conn.base_prompt or "") + "#"})
                        print(f"[shell] {params.get('host')} 셀 진입 {'(암호 보냄)' if _sent_pw else ''}", flush=True)
                        continue
                    # ─────────────────────────────────────────────────────

                    # 장비가 **무엇을 돌려줬는지** 남긴다.
                    #
                    # 여태 이 자리에 기록이 없어서, 「명령은 나갔는데 화면에
                    # 아무것도 안 나온다」 를 만났을 때 접속이 죽은 것인지
                    # 장비가 침묵한 것인지 가릴 방법이 없었다(지적). 받은
                    # 바이트와 걸린 시간만 남겨도 그 둘이 갈린다 — 0바이트면
                    # 장비가 안 보낸 것이고, 오래 걸렸으면 기다리다 끝난 것이다.
                    _cli_t0 = _tstr.time(); _cli_n = 0
                    await asyncio.sleep(0)
                    # ── y/n 답 스텝(지적: y 가 안 먹음) ──────────────────────
                    # 세션이 「Proceed ? [y/n] :」 확인에 서 있는 상태다. 여기서
                    # _cfg_ctx_keep 가 find_prompt(개행)를 먼저 보내면 그 개행이
                    # 확인을 빈 답으로 삼켜 버리고, y 는 일반 프롬프트에 떨어져
                    # 「% invalid input」 이 된다 — 셀 암호(Password:) 때와 같은
                    # 병이다. y/n 답 명령은 되밟기를 통째로 건너뛴다.
                    _is_yn_cmd = (cmd or "").strip().lower() in ("y", "yes", "n", "no")
                    # 직전 스텝이 Password: 에 세워 두었으면(지적: 셀 암호) 이 스텝은
                    # 그 물음의 답이다 — y/n 과 똑같이 되밟기·드레인을 건너뛴다.
                    _after_pw = bool(ent.pop("await_pw", False))
                    if not _is_yn_cmd and not _after_pw:
                        # 스텝을 나눠 보내면 그 사이 설정 모드가 풀릴 수 있다 —
                        # 풀렸으면 쌓아 둔 문맥을 조용히 되밟는다(지시: 프롬프트 유지)
                        await asyncio.to_thread(_cfg_ctx_keep, conn, ent, cmd)
                        try: await asyncio.to_thread(conn.read_channel)
                        except Exception: pass
                    await asyncio.to_thread(conn.write_channel, cmd + "\n")
                    _cfg_ctx_note(ent, cmd)
                    echo_done = False; pending = ""; idle = 0; dl = _tstr.time() + 30
                    while _tstr.time() < dl:
                        ch = ""
                        try: ch = conn.read_channel() or ""
                        except Exception: ch = ""
                        if ch:
                            idle = 0
                            _cli_n += len(ch)
                            if not echo_done:
                                pending += ch
                                _nl = pending.find("\n")
                                if _nl < 0:
                                    await asyncio.sleep(0)
                                    continue
                                echo_done = True
                                # 명령 에코(첫 줄)에는 **그때의 진짜 프롬프트**가 들어 있다 —
                                # `R3(config)#interface …`. 여태 통째로 버려서 화면이
                                # 늘 `E6100#` 로 굳어 있었다(지적). 프롬프트만 떼어 보낸다.
                                _echo = pending[:_nl].replace("\r", "").rstrip()
                                _mpr = _restr.match(r"^(\S.*?[#>])\s*(?:" + _restr.escape(cmd) + r")?\s*$", _echo)
                                if _mpr:
                                    yield _sse({"pr": _mpr.group(1)})
                                pending = pending[_nl + 1:]   # 에코 줄 자체는 버린다
                            else:
                                pending += ch
                            # chunk 즉시 push (줄 단위 대기 X) — echo 처리된 이후 모든 데이터 실시간
                            if pending:
                                _emit = pending
                                # 마지막 줄이 완전한 줄이 아니면(개행 없음) 프롬프트 확인 위해 남겨둠
                                if pending.endswith("\n"):
                                    pending = ""
                                else:
                                    _last_nl = pending.rfind("\n")
                                    if _last_nl >= 0:
                                        _emit = pending[:_last_nl + 1]
                                        pending = pending[_last_nl + 1:]
                                    else:
                                        _emit = ""   # 개행 없는 짧은 tail 은 프롬프트 후보 → 보류
                                if _emit:
                                    yield _sse({"o": _emit})
                                    await asyncio.sleep(0)
                            # 암호 물음(지시: 라이브 터미널에서 start-shell 접속) —
                            # `Password:` 로 끝나면 그 명령은 여기서 끝난 것이다.
                            # 프롬프트가 아니라 12초 idle 을 기다리던 것이 접속을
                            # 막던 진범. 남은 tail 을 보이고 제어를 돌려준다 —
                            # 사용자가 다음 줄에 암호를 치면 그대로 들어간다.
                            if pending and _restr.search(r"pass\s*word\s*:?\s*$", pending.strip(), _restr.I):
                                if pending: yield _sse({"o": pending})
                                # 세션이 Password: 에 서 있다(지적: 셀 암호가 안 먹음) —
                                # 다음 스텝(암호)은 find_prompt(개행)를 보내면 안 된다.
                                ent["await_pw"] = True
                                pending = ""; break
                            # 확인 물음(「Proceed ? [y/n] :」 등)도 같다(지적: y 가 안 먹음) —
                            # 프롬프트를 기다리며 idle 시간을 다 태우지 않고 여기서 스텝을
                            # 끝낸다. 세션은 확인에 선 채 남아, 다음 스텝의 y/n 이 그
                            # 자리에 바로 들어간다.
                            if pending and _restr.search(
                                r"(?:\(y/n\)|\[y/n\]|\(yes/no\)|\[yes/no\])\s*[:?]?\s*$",
                                pending.strip(), _restr.I,
                            ):
                                if pending: yield _sse({"o": pending})
                                # 세션이 확인 물음(reload 의 [y/n] 등)에 서 있다
                                # (지적: 이전엔 reload→y 가 됐다). 암호(await_pw)
                                # 와 똑같이 표시해 둔다 — 이 스텝 끝의 find_prompt
                                # (개행)도, 다음 스텝의 되밟기·드레인도 건너뛰어
                                # 개행이 [y/n] 을 빈 답으로 삼키지 않게 한다.
                                ent["await_pw"] = True
                                pending = ""; break
                            if pr and pending.strip() and _restr.search(pr, pending.strip()):
                                _quiet_dl = _tstr.time() + _quiet_wait
                                _saw_more = False
                                while _tstr.time() < _quiet_dl:
                                    try: _ch2 = conn.read_channel() or ""
                                    except Exception: _ch2 = ""
                                    if _ch2:
                                        pending += _ch2; _saw_more = True
                                        if pending.endswith("\n"):
                                            yield _sse({"o": pending}); pending = ""
                                        else:
                                            _last_nl = pending.rfind("\n")
                                            if _last_nl >= 0:
                                                yield _sse({"o": pending[:_last_nl + 1]})
                                                pending = pending[_last_nl + 1:]
                                        await asyncio.sleep(0)
                                        _quiet_dl = _tstr.time() + _quiet_wait
                                    else:
                                        await asyncio.sleep(0.05)
                                if _saw_more and pending.strip() and not _restr.search(pr, pending.strip()):
                                    continue
                                pending = ""; break
                        else:
                            if echo_done and pending.strip():
                                _ps = pending.strip()
                                # 셀 프롬프트($)도 스텝 끝으로 본다(지적: 셀 진입 뒤 멈춤)
                                if (pr and _restr.search(pr, _ps)) or _restr.search(r"\S+[#>$]\s*$", _ps):
                                    try:
                                        _np = _ps.split("\n")[-1].strip().rstrip("#>$ ")
                                        if _np: pr = _restr.escape(_np) + r"\S*[#>$]\s*$"
                                    except Exception: pass
                                    pending = ""; break
                            idle += 1
                            if idle > 240:
                                if pending: yield _sse({"o": pending})
                                pending = ""; break
                            await asyncio.sleep(0.05)
                    if pending.strip() and not (pr and _restr.search(pr, pending.strip())):
                        yield _sse({"o": pending})
                        await asyncio.sleep(0)
                    # 명령이 끝나면 **지금 프롬프트를 알린다**(지적: ubidjemals 로
                    # (admin) 모드로 바뀌었는데 화면이 안 바뀐다). 모드 바꾸는
                    # 명령(ubidjemals·config·exit)은 출력이 없어 pr 이 안 나갔다.
                    # Password: 등에 서 있으면(await_pw) 프롬프트가 아니니 건너뛴다.
                    if not ent.get("await_pw"):
                        try:
                            _cp = await asyncio.to_thread(conn.find_prompt)
                            _cp = (_cp or "").strip()
                            if _cp:
                                yield _sse({"pr": _cp})
                                _bp2 = _cp.rstrip("#>$ ").split("(")[0].strip()
                                if _bp2:
                                    conn.base_prompt = _bp2
                                    pr = _restr.escape(_bp2) + r"\S*[#>$]\s*$"
                        except Exception:
                            pass
                    _cli_ms = int((_tstr.time() - _cli_t0) * 1000)
                    print(
                        f"[cli] {params.get('host')} sess={payload.get('sess')} "
                        f"{_cli_n}B {_cli_ms}ms"
                        f"{' 응답없음' if _cli_n == 0 else ''} :: {cmd[:80]}",
                        flush=True,
                    )
                ent["ts"] = _t.time()
                yield _sse({"done": True})
            except Exception as e:
                yield _sse({"err": str(e)[:200]}); yield _sse({"done": True})
        finally:
            if _lk_got:
                try: ent["lock"].release()
                except Exception: pass
    return StreamingResponse(_gen(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Content-Encoding": "identity"})

@router.post("/api/cli-complete")
def cli_complete(payload: dict):
    """터미널 Tab 자동완성: 영속 세션에 '부분명령+Tab'을 보내 장비가 완성한 명령을 읽어 반환."""
    import re as _re
    params = _netmiko_params(payload)
    partial = str(payload.get("partial", "") or "")
    help_mode = bool(payload.get("help"))   # '?' 도움말: 입력 가능한 명령 목록(실행 안 함)
    if not params["host"]:
        return {"ok": False, "error": "IP가 없습니다"}
    ent = _get_conn_entry(params)
    with ent["lock"]:
        conn = ent.get("conn")
        if conn is None:
            return {"ok": False, "error": "세션이 열려 있지 않습니다", "no_session": True}
        try:
            try: conn.read_channel()   # 잔여 비우기
            except Exception: pass
            conn.write_channel(partial + ("?" if help_mode else "\t"))
            _t.sleep(0.25)
            data = ""; _idle = 0; _dl = _t.time() + (2.5 if help_mode else 1.2)
            while _t.time() < _dl:
                ch = ""
                try: ch = conn.read_channel() or ""
                except Exception: ch = ""
                if ch:
                    data += ch; _idle = 0
                else:
                    _idle += 1
                    if _idle >= 2: break
                    _t.sleep(0.1)
            try:  # 장비 입력 라인 비우기(Ctrl+U) → 다음 명령 오염 방지
                conn.write_channel("\x15"); _t.sleep(0.05); conn.read_channel()
            except Exception: pass
            ent["ts"] = _t.time()
            clean = _re.sub(r"\x1b\[[0-9;?]*[a-zA-Z]", "", data).replace("\x07", "")
            buf = []
            for chh in clean:
                if chh == "\x08":
                    if buf: buf.pop()
                else:
                    buf.append(chh)
            clean = "".join(buf)
            seg = _re.split(r"[\r\n]", clean)
            if help_mode:
                # '?' 도움말: 프롬프트(에코 'host# show ?' / 재표시) 줄을 빼고 명령 목록만 반환
                _isprompt = _re.compile(r"^\s*\S+[>#]")
                opts = []
                for s in seg:
                    st = s.rstrip()
                    if not st.strip():
                        continue
                    if _isprompt.match(st):
                        continue
                    opts.append(st)
                return {"ok": True, "help": "\n".join(opts), "options": opts, "raw": clean[-3000:]}
            last = ""
            for s in seg:
                if s.strip(): last = s
            m = _re.search(r"[>#]\s*(.*)$", last)
            if m and m.group(1).strip():
                completed = m.group(1).strip()
            else:
                completed = last.strip() or partial
            options = [s.rstrip() for s in seg if s.strip() and not _re.search(r"[>#]\s*$", s)]
            return {"ok": True, "completed": completed, "options": options, "raw": clean[-2000:]}
        except Exception as e:
            return {"ok": False, "error": str(e)[:300]}

@router.post("/api/session-open")
def session_open(payload: dict):
    params = _netmiko_params(payload)
    if not params["host"]:
        return {"ok": False, "error": "IP가 없습니다"}
    ent = _get_conn_entry(params)
    with ent["lock"]:
        try:
            # Session Open: 기존 세션 닫고 새로 열어 로그인 과정(배너/Username/Password)을 캡처
            if ent.get("conn"):
                try:
                    ent["conn"].disconnect()
                except Exception:
                    pass
                ent["conn"] = None
            # 빠른 접속(터미널용): 로그인 전문 캡처를 생략 → 접속 지연 최소화. 프롬프트만 반환(로그인 로그 노출 안 함).
            if payload.get("fast"):
                import io as _iof, re as _ref
                _ts0 = _t.time()
                buf = _iof.BytesIO()
                from netmiko import ConnectHandler as _CH
                p2 = _nm_only(params); p2["session_log"] = buf; p2["session_log_record_writes"] = True
                p2["global_delay_factor"] = 0.1   # 텔넷 로그인 루프의 sleep(0.5s×~20)이 최초 접속 지연의 주범 → 낮춰 단축 (장비 응답은 그대로)
                p2["conn_timeout"] = 8            # TCP 접속 타임아웃 단축
                conn = _CH(**p2)                # 빠른 읽기 + 로그인 전문 캡처
                _ts_conn = _t.time()            # ① 접속 + telnet 로그인 완료 시점
                ent["paging_off"] = False       # Session Open: 새 세션이므로 paging flag 초기화
                _force_enable(conn, params, ent)  # 무조건 enable(#) + 페이징 끄기 (세션당 1회)
                _ts_enable = _t.time()          # ② enable/페이징 완료
                prompt = ""
                try:
                    prompt = conn.find_prompt()
                except Exception:
                    pass
                _ts_prompt = _t.time()          # ③ 프롬프트 확인
                try:
                    conn.session_log.flush()
                except Exception:
                    pass
                ent["conn"] = conn
                ent["ts"] = _t.time()
                ent["log_buf"] = buf
                login_log = ""
                try:
                    login_log = buf.getvalue().decode("utf-8", "replace")
                    for _pw in (params.get("password") or "", params.get("secret") or ""):
                        if _pw:
                            login_log = login_log.replace(_pw, "********")
                    login_log = _ref.sub(r"(?i)(password[^\r\n:]*:[ \t]*)\S+", r"\1********", login_log)
                except Exception:
                    pass
                return {"ok": True, "prompt": prompt, "login_log": login_log,
                        "elapsed": round(_t.time() - _ts0, 1),
                        "t_connect": round(_ts_conn - _ts0, 1),
                        "t_enable": round(_ts_enable - _ts_conn, 1),
                        "t_prompt": round(_ts_prompt - _ts_enable, 1)}
            import io as _io, re as _re2
            buf = _io.BytesIO()
            from netmiko import ConnectHandler
            p2 = dict(params); p2["session_log"] = buf; p2["session_log_record_writes"] = True
            p2["fast_cli"] = False          # 로그인 배너/Username/Password 교환을 session_log에 온전히 담기 위해 천천히 읽기
            p2["global_delay_factor"] = 1
            conn = ConnectHandler(**p2)
            ent["paging_off"] = False   # Session Open: 새 세션이므로 paging flag 초기화
            _force_enable(conn, params, ent)  # 접속 직후 무조건 enable(#) 진입 + terminal length 0 (세션당 1회)
            prompt = ""
            try:
                prompt = conn.find_prompt()
            except Exception:
                pass
            # netmiko(SessionLog)는 로그를 메모리(slog_buffer)에 모았다가 flush 시점에만 실제 버퍼(buf)에 기록한다.
            # 접속 직후엔 flush 전이라 buf가 비어 로그인 과정이 누락됨 → 명시적으로 flush 해서 로그인 전문을 buf에 내린다.
            try:
                conn.session_log.flush()
            except Exception:
                pass
            ent["conn"] = conn
            ent["ts"] = _t.time()
            ent["log_buf"] = buf  # 이후 run-cli 명령들의 raw 입출력도 이 버퍼에 누적 → 실시간 터미널 로그
            try:
                login_log = buf.getvalue().decode("utf-8", "replace")
            except Exception:
                login_log = ""
            # 비밀번호 마스킹 (실제 값 치환 + Password: 뒤 입력 방어적 마스킹)
            for _pw in (params.get("password") or "", params.get("secret") or ""):
                if _pw:
                    login_log = login_log.replace(_pw, "********")
            login_log = _re2.sub(r"(?i)(password[^\r\n:]*:[ \t]*)\S+", r"\1********", login_log)
            # 셋업 명령(페이징 'terminal length 0' / 'terminal width')만 로그인 로그에서 숨긴다.
            # 그로 인한 '프롬프트만' 연속 중복 줄만 접고(로그인 배너·login:·Password: 등 실제 내용 줄은 절대 제거 X),
            # 만약 결과가 비면 원본을 유지해 로그인 과정이 사라지지 않게 한다(전송 동작엔 영향 없음 — 표시만 정리).
            _ll = []
            _prompt_re = _re2.compile(r"^\S+[>#]\s*$")   # 프롬프트만 있는 줄
            for _ln in login_log.split("\n"):
                _s = _ln.strip()
                if ("terminal length 0" in _s) or ("terminal width" in _s):
                    continue
                if ("% Invalid input" in _s) or (_s == "^"):   # terminal width 511 미지원 장비의 에러 표시 제거
                    continue
                if _ll and _ll[-1].strip() == _s and _prompt_re.match(_s):
                    continue
                _ll.append(_ln)
            _filtered = "\n".join(_ll)
            if _filtered.strip():
                login_log = _filtered
            return {"ok": True, "prompt": prompt, "login_log": login_log}
        except Exception as e:
            ent["conn"] = None
            return {"ok": False, "error": str(e)[:400]}

@router.post("/api/session-close")
def session_close(payload: dict):
    params = _netmiko_params(payload)
    ent = _get_conn_entry(params)
    with ent["lock"]:
        try:
            if ent.get("conn"):
                ent["conn"].disconnect()
        except Exception:
            pass
        ent["conn"] = None
        ent["ts"] = 0.0
        return {"ok": True}


@router.post("/api/session-write")
def session_write(payload: dict):
    """열려 있는 세션에 **글자 한 줄을 바로 써 보낸다**(지시: 셀 암호 입력할
    시간이 없다). start-shell 뒤 `Password:` 에 서 있는 세션에, 왕복 없이
    암호를 즉시 넣기 위한 빠른 길 — 재접속·문맥 되밟기 없이 write 만 하고
    짧게 응답을 읽어 돌려준다. 마스크된 값이라 로그엔 안 남긴다."""
    params = _netmiko_params(payload)
    text = str(payload.get("text") or "")
    ent = _get_conn_entry(params)
    conn = ent.get("conn")
    if not conn:
        return {"ok": False, "error": "세션이 없습니다 — 먼저 접속하세요"}
    try:
        import time as _tw
        try:
            conn.read_channel()   # 물음 뒤 잔여를 비운다(암호 에코 방지)
        except Exception:
            pass
        conn.write_channel(text + "\n")
        out = ""
        t0 = _tw.time()
        tail = ""
        while _tw.time() - t0 < 6.0:
            try:
                ch = conn.read_channel() or ""
            except Exception:
                ch = ""
            if ch:
                out += ch
                tail = (tail + ch)[-160:]
                # 셀·일반 프롬프트나 실패 문구가 오면 끝
                if re.search(r"[#>$]\s*$", tail.strip()) or re.search(r"incorrect|denied|fail", tail, re.I):
                    _tw.sleep(0.2)
                    try:
                        out += conn.read_channel() or ""
                    except Exception:
                        pass
                    break
            else:
                _tw.sleep(0.08)
        ent["ts"] = _tw.time()
        ent["cfg_ctx"] = []   # 셀로 갈아탔으면 설정 문맥은 뜻이 없다
        try:
            _np = conn.find_prompt()
            if _np:
                conn.base_prompt = _np.strip().rstrip("#>$ ").split("(")[0].strip()
        except Exception:
            pass
        return {"ok": True, "out": out}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/api/session-break")
def session_break(payload: dict):
    """Ctrl+C(\\x03) 를 지금 세션에 보낸다(지시: ping 이 안 멈춘다).

    도는 명령(스트림)이 세션 잠금을 쥔 채라, **잠금 없이 쓰기만** 한다 —
    읽기는 도는 쪽 루프가 그대로 받아 프롬프트 복귀까지 흘린다."""
    params = _netmiko_params(payload)
    ent = _get_conn_entry(params)
    conn = ent.get("conn")
    if not conn:
        return {"ok": False, "error": "세션이 없습니다 — 먼저 접속하세요"}
    try:
        conn.write_channel("\x03")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


@router.post("/api/session-key")
def session_key(payload: dict):
    """탭 완성·`?` 도움말 — 터미널의 진짜 CLI 손맛(지적: 캡쳐 터미널에서 안 됨).

    지금 세션 채널에 **엔터 없이 글자만** 흘리고, 장비가 돌려주는 것
    (완성된 낱말·도움말 목록)을 읽어 온다. 명령은 실행되지 않는다.

    읽고 나면 Ctrl-U 로 장비 쪽 입력줄을 비운다 — 안 비우면 장비 버퍼에
    친 글자가 남아, 다음에 보내는 진짜 명령 앞에 붙어 엉뚱한 명령이 된다.
    (netmiko 의 send_command 는 보내기 전에 수신 버퍼를 비우므로, 남는
    재출력 프롬프트는 다음 명령에 안 섞인다.)
    """
    params = _netmiko_params(payload)
    text = str(payload.get("text") or "")
    # 개행은 금지 — 이 길은 완성/도움말용이지 실행이 아니다
    text = text.replace("\r", "").replace("\n", "")
    if not text:
        return {"ok": False, "error": "보낼 글자가 없습니다"}
    ent = _get_conn_entry(params)
    with ent["lock"]:
        conn = ent.get("conn")
        if not conn:
            return {"ok": False, "error": "세션이 없습니다 — 먼저 접속하세요"}
        try:
            conn.write_channel(text)
            out = ""
            quiet = 0.0
            t0 = _t.time()
            # 장비가 조용해질 때까지 모은다 — 도움말이 길면 여러 조각으로 온다
            while _t.time() - t0 < 2.5:
                _t.sleep(0.12)
                chunk = conn.read_channel()
                if chunk:
                    out += chunk
                    quiet = 0.0
                else:
                    quiet += 0.12
                    if out and quiet >= 0.4:
                        break
            # 장비 입력줄 비우기 (Ctrl-U) — 대부분의 네트워크 OS 가 받는다
            try:
                conn.write_channel("\x15")
                _t.sleep(0.2)
                conn.read_channel()
            except Exception:
                pass
            return {"ok": True, "out": out}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

@router.post("/api/ping-stream")
async def ping_stream(payload: dict):
    """ping 을 줄 단위로 흘려보낸다 (SSE).

    `/api/ping` 은 다 끝난 뒤 한 번에 준다. 재부팅 시험에서는 그게 쓸모가
    없다 — '안 되고… 안 되고… 됐다' 가 실시간으로 보여야 언제 살아났는지
    안다. 4번을 다 기다린 뒤 결과만 보면 그 순간을 놓친다.

    subprocess 를 asyncio 로 띄워 stdout 을 한 줄씩 읽어 보낸다.
    """
    from fastapi.responses import StreamingResponse
    import json as _jp

    host = (payload.get("host") or "").strip()
    try:
        count = max(1, min(60, int(payload.get("count", 4) or 4)))
    except Exception:
        count = 4

    def _sse(obj):
        return "data: " + _jp.dumps(obj, ensure_ascii=False) + "\n\n"

    async def _gen():
        if not host:
            yield _sse({"err": "대상 IP 가 없습니다"})
            yield _sse({"done": True, "alive": False})
            return
        # -c 는 리눅스. 컨테이너 안에서만 도므로 윈도우 분기는 두지 않는다.
        proc = None
        try:
            proc = await asyncio.create_subprocess_exec(
                "ping", "-c", str(count), "-W", "2", host,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
        except FileNotFoundError:
            yield _sse({"err": "이미지에 ping 이 없습니다"})
            yield _sse({"done": True, "alive": False})
            return
        except Exception as e:
            yield _sse({"err": str(e)[:300]})
            yield _sse({"done": True, "alive": False})
            return

        try:
            assert proc.stdout is not None
            while True:
                # ping -c N 은 대략 N초가 걸린다. 넉넉히 잡되 영영 매달리지는
                # 않게 한 줄마다 상한을 둔다.
                try:
                    line = await asyncio.wait_for(proc.stdout.readline(), timeout=count + 20)
                except asyncio.TimeoutError:
                    yield _sse({"err": "응답이 너무 늦습니다"})
                    break
                if not line:
                    break
                yield _sse({"o": line.decode("utf-8", "replace")})
            rc = await proc.wait()
        except Exception as e:
            print(f"[ping_stream] 읽기 실패: {e}", flush=True)
            rc = 1
        finally:
            try:
                if proc and proc.returncode is None:
                    proc.kill()
            except Exception as e:
                print(f"[ping_stream] 정리 실패: {e}", flush=True)
        yield _sse({"done": True, "alive": rc == 0})

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache", "Content-Encoding": "identity"},
    )


@router.post("/api/ping")
def ping_host(payload: dict):
    host = (payload.get("host") or "").strip()
    if not host:
        return {"ok": False, "error": "host(IP)가 없습니다", "output": ""}
    import subprocess, platform
    is_win = platform.system().lower().startswith("win")
    try:
        count = max(1, min(20, int(payload.get("count", 4) or 4)))
    except Exception:
        count = 4
    cmd = ["ping", "-n" if is_win else "-c", str(count), host]
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=40)
        enc = "cp949" if is_win else "utf-8"
        out = (p.stdout or b"").decode(enc, errors="replace")
        err = (p.stderr or b"").decode(enc, errors="replace")
        full = out + (("\n" + err) if err.strip() else "")
        return {"ok": True, "output": full.strip(), "returncode": p.returncode, "alive": p.returncode == 0}
    except Exception as e:
        return {"ok": False, "error": str(e)[:300], "output": ""}

def _snmp_is_noinstance(s):
    s = str(s)
    return any(k in s for k in ("No Such Instance", "No Such Object", "noSuchInstance",
                                "noSuchObject", "endOfMibView", "No more variables"))

def _fmt_timeticks(ticks):
    # SNMP TimeTicks(1/100초) → "N일 H시간 M분 S초" 사람이 읽는 형식
    try:
        t = int(ticks)
    except Exception:
        return None
    if t < 0:
        return None
    sec = t // 100
    d = sec // 86400; sec %= 86400
    h = sec // 3600; sec %= 3600
    m = sec // 60; s = sec % 60
    out = ("%d days, " % d) if d else ""
    return out + ("%d hours, %d mins, %d secs" % (h, m, s))

def _snmp_val_str(vobj):
    # varbind 값 문자열 — TimeTicks면 "원시값 (N일 H시간 M분 S초)" 로 변환
    try:
        s = vobj.prettyPrint()
    except Exception:
        return str(vobj)
    try:
        if vobj.__class__.__name__ == "TimeTicks":
            ft = _fmt_timeticks(int(vobj))
            if ft and ("days" not in s and "hours" not in s):
                s = s + " (" + ft + ")"
    except Exception:
        pass
    # 값이 OBJECT IDENTIFIER(또는 숫자 OID 형태)면 이름으로 해석 (예: 1.3.6.1.4.1.7800.1.238 → .iso.org...E5724RL)
    try:
        cn = vobj.__class__.__name__
        st = s.strip()
        _looks_oid = st.lstrip(".").replace(".", "").isdigit() and st.lstrip(".").count(".") >= 4
        if cn in ("ObjectIdentifier", "ObjectIdentity") or _looks_oid:
            nm = _snmp_oid_name(st)
            if nm and nm.lstrip(".") != st.lstrip("."):
                s = nm + " (" + st.lstrip(".") + ")"
    except Exception:
        pass
    return s

# SNMP enum 이름 매핑 — OID(인스턴스 제외 베이스) → {정수값(str): 이름}.
# 대량 매핑은 data/MIB/ 에서 추출한 data/snmp/snmp_enums.json 에서 자동 로드 (tools/mib_enums.py 로 재생성).
_SNMP_MANUAL = {
    # 수동 보정(MIB 없거나 덮어쓸 OID만 여기 추가). MIB 추출값보다 우선.
    "1.3.6.1.4.1.7800.100.1.1.3.6": {"1": "fiveSec", "2": "oneMin", "3": "fiveMin"},
}
SNMP_ENUM_MAP = dict(_SNMP_MANUAL)
# SNMP SET 타입 약어 → 표시명 (snmp_set_api 응답/에러힌트용). 동작 불변.
_SNMP_TYPE_NAMES = {"i": "Integer", "u": "Unsigned", "c": "Counter32", "g": "Gauge32", "t": "TimeTicks", "s": "String", "a": "IpAddress", "x": "Hex"}
SNMP_OID_NAMES = {}            # 숫자 OID → 이름(전체 경로). 값이 OBJECT IDENTIFIER 인 응답·OID 표시 해석용 (mib_enums.py 추출)
_SNMP_ENUM_MTIME = [None]   # data/snmp/snmp_enums.json 의 마지막 로드 mtime — 변경 시 자동 재로드
def _load_snmp_enums(force=False):
    # data/snmp/snmp_enums.json(MIB 추출) 로드 후 SNMP_ENUM_MAP 재구성(수동 항목 우선). 파일 mtime이 바뀐 경우만 다시 읽음 → 재시작 없이 반영.
    try:
        f = core.DATA_DIR / "snmp" / "snmp_enums.json"
        mt = f.stat().st_mtime if f.exists() else 0.0
        if (not force) and (_SNMP_ENUM_MTIME[0] == mt):
            return
        _SNMP_ENUM_MTIME[0] = mt
        newmap = dict(_SNMP_MANUAL); cnt = 0
        if f.exists():
            import json as _json
            data = _json.loads(f.read_text(encoding="utf-8"))
            for oid, m in data.items():
                if oid not in newmap and isinstance(m, dict):
                    newmap[oid] = {str(k): str(v) for k, v in m.items()}; cnt += 1
        SNMP_ENUM_MAP.clear(); SNMP_ENUM_MAP.update(newmap)   # 같은 객체 갱신(참조 유지)
        # OID → 이름 맵도 같이 로드(숫자 OID 해석)
        nf = core.DATA_DIR / "snmp" / "snmp_names.json"; ncnt = 0
        if nf.exists():
            import json as _json
            nd = _json.loads(nf.read_text(encoding="utf-8"))
            if isinstance(nd, dict):
                SNMP_OID_NAMES.clear(); SNMP_OID_NAMES.update({str(k): str(v) for k, v in nd.items()}); ncnt = len(SNMP_OID_NAMES)
        print(f"[SNMP] MIB enum {cnt}개 / OID 이름 {ncnt}개 로드 (총 enum {len(SNMP_ENUM_MAP)})")
    except Exception as e:
        print(f"[SNMP] enum/name JSON 로드 실패: {e}")
def _snmp_oid_name(num):
    # 숫자 OID(앞 점 무관) → 이름. 인스턴스 접미(.0, .N)도 떼고 재시도. 없으면 None.
    try:
        s = str(num).lstrip(".")
        if s in SNMP_OID_NAMES: return SNMP_OID_NAMES[s]
        ps = s.split(".")
        for cut in (1, 2):
            if cut < len(ps):
                cand = ".".join(ps[: len(ps) - cut])
                if cand in SNMP_OID_NAMES: return SNMP_OID_NAMES[cand]
        return None
    except Exception:
        return None


_load_snmp_enums(force=True)
def _oid_to_num(nm):
    try:
        s = str(nm)
        s = s.replace("SNMPv2-SMI::enterprises", "1.3.6.1.4.1").replace("SNMPv2-SMI::", "")
        s = s.replace("iso.org.dod.internet.private.enterprises", "1.3.6.1.4.1").replace("iso.org.dod.internet", "1.3.6.1")
        return s.lstrip(".")
    except Exception:
        return str(nm)
def _snmp_enum(oid_num, vobj, val):
    # 정수형 값이고 매핑에 OID(인스턴스 제외)가 있으면 이름으로 표시
    try:
        if vobj.__class__.__name__ not in ("Integer", "Integer32", "Unsigned32", "Gauge32", "Counter32"):
            return val
        ps = oid_num.split(".")
        for cut in (1, 2, 0):
            if cut > len(ps):
                continue
            cand = ".".join(ps[: len(ps) - cut]) if cut else oid_num
            m = SNMP_ENUM_MAP.get(cand)
            if m:
                k = str(int(vobj))
                if k in m:
                    return m[k]
        return val
    except Exception:
        return val

def _snmp_set_enum(oid, value):
    # SET 값이 enum '이름'(예: fiveMin)이고 그 OID에 enum 맵이 있으면 정수(예: 3)로 변환. 이미 숫자/없음이면 None.
    try:
        v = str(value).strip()
        if v == "" or v.lstrip("-").isdigit():
            return None
        ps = str(oid).lstrip(".").split(".")
        for cut in (1, 2, 0):
            if cut > len(ps):
                continue
            cand = ".".join(ps[: len(ps) - cut]) if cut else ".".join(ps)
            m = SNMP_ENUM_MAP.get(cand)
            if m:
                for k, nm in m.items():
                    if str(nm).lower() == v.lower():
                        return str(k)
        return None
    except Exception:
        return None

_SNMP_ENG = None


def _snmp_engine():
    """SNMP 엔진은 **한 번만 만들어 돌려 쓴다**(지시: 지연을 제거).

    `SnmpEngine()` 생성이 매번 **54~60ms** 다(실측). SNMP 스텝마다 그만큼이
    그냥 나갔다 — 항목 62 개짜리 시험이면 초 단위로 쌓인다.

    예전에 매 요청마다 닫은 까닭은 FD 누수였다(Windows select() 512 한계).
    하나를 계속 쓰면 소켓도 하나뿐이라 그 문제가 애초에 안 생긴다.
    망가지면 `_snmp_engine_reset()` 이 버리고 다음 호출이 새로 만든다.
    """
    global _SNMP_ENG
    if _SNMP_ENG is None:
        from pysnmp.hlapi.v3arch.asyncio import SnmpEngine as _SE
        _SNMP_ENG = _SE()
    return _SNMP_ENG


def _snmp_engine_reset():
    """엔진을 버린다 — 오류가 났을 때만. 다음 호출이 새로 만든다."""
    global _SNMP_ENG
    eng, _SNMP_ENG = _SNMP_ENG, None
    _snmp_close(eng)


def _snmp_close(eng):
    # SNMP 엔진/디스패처(UDP 소켓) 정리 — 안 닫으면 반복 시 FD 누적 → Windows select() 512 한계 초과로 크래시
    if eng is None:
        return
    for m in ("close_dispatcher", "closeDispatcher"):
        try:
            getattr(eng, m)()
            return
        except Exception:
            pass
    try:
        td = getattr(eng, "transport_dispatcher", None) or getattr(eng, "transportDispatcher", None)
        if td:
            for m in ("close_dispatcher", "closeDispatcher"):
                try:
                    getattr(td, m)()
                    return
                except Exception:
                    pass
    except Exception:
        pass

@router.get("/api/snmp-oids")
async def snmp_oids(q: str = "", limit: int = 50):
    """MIB 에서 뽑아 둔 OID 이름표를 찾는다.

    화면에서 OID 를 손으로 치게 두면 `1.3.6.1.2.1.1.3.0` 를 외우거나 문서를
    뒤져야 한다. 이름으로 찾아 눌러 넣게 한다.

    자료는 `data/snmp/snmp_names.json` 이고 `tools/mib_enums.py` 가 만든다.
    없으면 빈 목록을 주되 어디서 만드는지 함께 알려 준다 — 빈 화면만 보면
    기능이 고장난 줄 안다.
    """
    _load_snmp_enums()
    n = (q or "").strip().lower()
    lim = max(1, min(300, int(limit or 50)))
    out = []
    for oid, name in SNMP_OID_NAMES.items():
        if n and n not in oid.lower() and n not in str(name).lower():
            continue
        out.append({"oid": oid, "name": name})
        if len(out) >= lim:
            break
    # 이름 순이 사람이 찾기 좋다. OID 숫자순은 트리 구조라 눈에 안 들어온다.
    out.sort(key=lambda x: str(x["name"]))
    return {
        "oids": out,
        "total": len(SNMP_OID_NAMES),
        "source": "data/snmp/snmp_names.json",
        "hint": "" if SNMP_OID_NAMES else "MIB 를 아직 안 뽑았습니다 — data/MIB/ 에 파일을 넣고 tools/mib_enums.py 를 돌리세요",
    }


_SNMP_WCOMM_CACHE: dict = {}   # host -> 최근에 SET 이 통한 쓰기 커뮤니티


async def _snmp_instances(host: str, comm: str, mp: int, col_oid: str, limit: int = 12):
    """그 열(column)에 **실제로 있는 인스턴스 번호**를 몇 개 — 진단용.

    장비의 ifIndex 는 1·2·3 이 아니라 101·102·112·1003… 처럼 띄엄띄엄한 경우가
    많다(지적: MIB 브라우저로 보면 그렇다). 그때 `.8.2` 로 SET 하면 noSuchName
    인데, 「없다」 만으로는 **무슨 번호를 써야 하는지** 알 수 없다. 있는 번호를
    같이 보여 주면 반복을 그 값으로 맞출 수 있다.
    """
    out = []
    try:
        from pysnmp.hlapi.v3arch.asyncio import (
            CommunityData, UdpTransportTarget, ContextData,
            ObjectType, ObjectIdentity, walk_cmd)
        try:
            from pysnmp.hlapi.v3arch.asyncio import bulk_walk_cmd as _bw
        except Exception:
            _bw = None
        eng = _snmp_engine()
        tr = await UdpTransportTarget.create((host, 161), timeout=1.2, retries=0)
        auth = CommunityData(comm, mpModel=mp)
        base = col_oid.strip().lstrip(".")
        walker = (_bw(eng, auth, tr, ContextData(), 0, 25, ObjectType(ObjectIdentity(base)), lexicographicMode=False)
                  if _bw is not None and mp == 1 else
                  walk_cmd(eng, auth, tr, ContextData(), ObjectType(ObjectIdentity(base)), lexicographicMode=False))
        async for (ei, es2, ex, vbs) in walker:
            if ei or es2:
                break
            for vb in vbs:
                nm = _oid_to_num(vb[0].prettyPrint()).lstrip(".")
                if nm.startswith(base + "."):
                    out.append(nm[len(base) + 1:])
            if len(out) >= limit:
                break
    except Exception:
        _snmp_engine_reset()
    return out[:limit]



async def _snmp_write_comms(host: str) -> list:
    """SET 에 시도할 **쓰기 커뮤니티 후보**를 차례로.

    장비마다 관례가 다르다: 어떤 건 읽기 public·쓰기 private, 어떤 건
    public 하나로 읽기·쓰기 다 된다(public-RW). 하나만 골라 보내면 한쪽
    장비에서 늘 막힌다(지적: 수동 .8.2 는 되는데 도구는 noSuchName). 그래서
    **여러 개를 차례로** 시도한다 — 실패한 SET 은 장비를 바꾸지 않으니 안전하다.

    차례: 등록된 쓰기 커뮤니티 → 등록된 읽기 커뮤니티 → private → public.
    """
    out = []
    try:
        host = (host or "").strip()
        ro = wo = ""
        for d in await db.device_list(with_ifs=False):
            if str(d.get("ip") or "").strip() != host:
                continue
            snmp = dev._acc_of(d, "snmp")
            params = snmp.get("params") or {}
            for _ in range(2):
                if isinstance(params, str):
                    try:
                        params = json.loads(params)
                    except Exception:
                        params = {}
            if not isinstance(params, dict):
                params = {}
            ro = snmp.get("username") or snmp.get("community") or ""
            wo = params.get("community_rw") or ""
            break
        _cached = _SNMP_WCOMM_CACHE.get(host)
        for c in (_cached, wo, ro, "private", "public"):
            if c and c not in out:
                out.append(c)
    except Exception:
        out = ["private", "public"]
    return out or ["private", "public"]


async def _snmp_comm_for(host: str, rw: bool):
    """이 IP 장비에 **저장된 커뮤니티**를 찾는다.

    읽기(public)는 되고 쓰기만 noAccess 로 막히던 까닭이 여기 있었다(지적):
    SNMP Set 이 늘 기본값 'private' 로 나갔는데, 장비의 쓰기 커뮤니티는 따로
    등록돼 있다(장비 SNMP 줄의 `community_rw`). 그 값을 꺼내 쓴다.

    rw=True 면 쓰기 커뮤니티를 먼저, 없으면 읽기 커뮤니티, 그것도 없으면
    None(부르는 쪽이 기본값을 쓴다).
    """
    try:
        host = (host or "").strip()
        if not host:
            return None
        for d in await db.device_list(with_ifs=False):
            if str(d.get("ip") or "").strip() != host:
                continue
            snmp = dev._acc_of(d, "snmp")
            params = snmp.get("params") or {}
            # params 가 문자열(때로 이중 인코딩)로 저장된 자료가 있다 — 풀어 준다
            for _ in range(2):
                if isinstance(params, str):
                    try:
                        params = json.loads(params)
                    except Exception:
                        params = {}
            if not isinstance(params, dict):
                params = {}
            ro = snmp.get("username") or snmp.get("community") or ""
            wo = params.get("community_rw") or ""
            if rw:
                # 쓰기는 **쓰기 커뮤니티만** 쓴다. 읽기 커뮤니티로 되돌아가면
                # 안 된다(지적: 수동은 private 로 되는데 도구는 안 된다) —
                # 읽기 community 가 public 이면 SET 을 public 으로 보내 noAccess
                # 가 난다. 없으면 None → 부르는 쪽이 관례값 'private' 를 쓴다.
                return (wo or None)
            return (ro or None)
    except Exception:
        pass
    return None


@router.post("/api/snmp-get")
async def snmp_get_api(payload: dict):
    _load_snmp_enums()   # JSON(MIB 추출) 변경 시 자동 재로드 → mib_enums.py 재실행만으로 반영(서버 재시작 불필요)
    eng = None
    host = (payload.get("host") or "").strip()
    oid = (payload.get("oid") or "").strip()
    community = payload.get("community") or await _snmp_comm_for(host, rw=False) or "public"
    ver = (payload.get("version") or "v2c").lower()
    try:
        port = int(payload.get("port", 161) or 161)
    except Exception:
        port = 161
    if not host:
        return {"ok": False, "error": "host(IP)가 없습니다", "output": ""}
    if not oid:
        return {"ok": False, "error": "OID가 없습니다", "output": ""}
    mp = 0 if ver == "v1" else 1
    mode = (payload.get("mode") or "auto").lower()   # auto(GET→없으면 WALK) | get | walk
    try:
        from pysnmp.hlapi.v3arch.asyncio import (
            CommunityData, UdpTransportTarget, ContextData,
            ObjectType, ObjectIdentity, get_cmd, walk_cmd)
        try:
            from pysnmp.hlapi.v3arch.asyncio import bulk_walk_cmd as _bulk_walk_cmd
        except Exception:
            _bulk_walk_cmd = None
        eng = _snmp_engine()
        # 첫 패킷이 늦으면 이 시간을 다 기다린다 — 가끔 3s 씩 튀던 까닭이다
        # (지적). 짧게 잡고 재시도 1 로 유실만 메꾼다.
        transport = await UdpTransportTarget.create((host, port), timeout=1.2, retries=1)
        auth = CommunityData(community, mpModel=mp)

        async def _do_walk():
            rows = []
            try:
                # v2c(mp==1) 면 GETBULK — 한 번에 여러 행을 받아 왕복·유실을 줄인다.
                # v1 이나 미지원이면 GETNEXT(walk_cmd)로 떨어진다.
                if _bulk_walk_cmd is not None and mp == 1:
                    _walker = _bulk_walk_cmd(
                        eng, auth, transport, ContextData(),
                        0, 25,
                        ObjectType(ObjectIdentity(oid)), lexicographicMode=False)
                else:
                    _walker = walk_cmd(
                        eng, auth, transport, ContextData(),
                        ObjectType(ObjectIdentity(oid)), lexicographicMode=False)
                async for (eInd, eStat, eIdx, vbs) in _walker:
                    if eInd or eStat:
                        break
                    for vb in vbs:
                        try:
                            nm = vb[0].prettyPrint(); val = _snmp_enum(_oid_to_num(nm), vb[1], _snmp_val_str(vb[1]))
                        except Exception:
                            nm = str(vb); val = ""
                        if _snmp_is_noinstance(val):
                            continue
                        rows.append(nm + " = " + val)
                    if len(rows) >= 500:
                        break
            except Exception:
                pass
            return rows

        if mode == "walk":
            rows = await _do_walk()
            if rows:
                return {"ok": True, "output": "\n".join(rows), "count": len(rows), "mode": "walk"}
            return {"ok": False, "error": "WALK 결과 없음", "output": "[SNMP] " + oid + " 하위에 데이터가 없습니다"}

        # GET 먼저
        errInd, errStat, errIdx, varBinds = await get_cmd(
            eng, auth, transport, ContextData(), ObjectType(ObjectIdentity(oid)))
        if errInd:
            return {"ok": False, "error": str(errInd), "output": "[SNMP] " + str(errInd)}
        if errStat:
            return {"ok": False, "error": str(errStat.prettyPrint()), "output": "[SNMP] " + str(errStat.prettyPrint())}
        lines = []; noinst = False
        for vb in varBinds:
            try:
                nm = vb[0].prettyPrint(); val = _snmp_enum(_oid_to_num(nm), vb[1], _snmp_val_str(vb[1]))
                lines.append(nm + " = " + val)
                if _snmp_is_noinstance(val):
                    noinst = True
            except Exception:
                lines.append(str(vb))
        # GET이 No Such Instance/Object → 테이블 컬럼일 가능성 → WALK 자동 폴백
        if noinst and mode == "auto":
            rows = await _do_walk()
            if rows:
                return {"ok": True, "output": "\n".join(rows), "count": len(rows), "mode": "walk"}
            return {"ok": False, "error": "No Such Instance — 이 OID에 인스턴스가 없습니다 (스칼라는 끝에 .0, 테이블은 인덱스 필요)",
                    "output": "[SNMP] " + ("\n".join(lines) if lines else oid + " : No Such Instance")}
        if noinst:
            return {"ok": False, "error": "No Such Instance/Object",
                    "output": "[SNMP] " + ("\n".join(lines) if lines else "(빈 응답)")}
        return {"ok": True, "output": "\n".join(lines) if lines else "(빈 응답)", "mode": "get"}
    except Exception as e:
        _msg = str(e)
        if "No module named" in _msg and ("pysnmp" in _msg or "pyasn1" in _msg):
            _msg = "pysnmp 미설치 — 백엔드에서 'python -m pip install pysnmp' 실행 후 서버 재시작"
        _snmp_engine_reset()   # 망가졌을 수 있다 — 버리고 다음에 새로 만든다
        return {"ok": False, "error": _msg[:300], "output": "[SNMP 오류] " + _msg[:220]}

@router.post("/api/snmp-set")
async def snmp_set_api(payload: dict):
    host = (payload.get("host") or "").strip()
    oid = (payload.get("oid") or "").strip().lstrip(".")
    value = payload.get("value")
    value = "" if value is None else str(value)
    # 쓰기 커뮤니티는 장비에 등록된 것을 먼저 쓴다(지적: noAccess). 없으면 private.
    # 명시했으면 그것만. 아니면 여러 쓰기 커뮤니티를 차례로 시도한다(지적).
    _explicit = payload.get("community")
    comm_cands = [_explicit] if _explicit else (await _snmp_write_comms(host))
    community = comm_cands[0]
    ver = (payload.get("version") or "v2c").lower()
    vtype = (payload.get("type") or "").strip().lower()   # 선택: i/s/u/a … 없으면 자동(숫자→정수, 그 외→문자열)
    _load_snmp_enums()                                     # enum 맵 최신화
    _ev = _snmp_set_enum(oid, value)                       # enum 이름(fiveMin)이면 정수(3)로 변환 → 숫자 흐름으로
    if _ev is not None:
        value = _ev
    eng = None
    try:
        port = int(payload.get("port", 161) or 161)
    except Exception:
        port = 161
    if not host:
        return {"ok": False, "error": "host(IP)가 없습니다", "output": ""}
    if not oid:
        return {"ok": False, "error": "OID가 없습니다", "output": ""}
    try:
        from pysnmp.hlapi.v3arch.asyncio import (
            CommunityData, UdpTransportTarget, ContextData,
            ObjectType, ObjectIdentity, set_cmd)
        from pysnmp.proto.rfc1902 import Integer32, OctetString, Unsigned32, IpAddress, Counter32, Gauge32, TimeTicks
        def _mkval(tt, val):
            if tt in ("i", "int", "integer"):
                return Integer32(int(val))
            if tt in ("u", "uint", "unsigned"):
                return Unsigned32(int(val))
            if tt in ("g", "gauge", "gauge32"):
                return Gauge32(int(val))
            if tt in ("c", "counter", "counter32"):
                return Counter32(int(val))
            if tt in ("t", "ticks", "timeticks"):
                return TimeTicks(int(val))
            if tt in ("a", "ip", "ipaddress"):
                return IpAddress(val)
            if tt in ("x", "hex"):
                return OctetString(hexValue=val.replace(" ", "").replace("0x", ""))
            return OctetString(val)
        # 후보 타입: 명시 타입 있으면 그것만. 없으면 숫자→[Integer32→Unsigned32→Counter32→Gauge32] wrongType 시 자동 재시도, 그 외→문자열
        if vtype:
            cands = [vtype]
        else:
            _digits = value.lstrip("-")
            cands = ["i", "u", "c", "g"] if (_digits.isdigit() and value not in ("", "-")) else ["s"]
        eng = _snmp_engine()
        # 안 맞는 커뮤니티는 응답이 없어 타임아웃까지 매달린다 — 짧게(지적:
        # 시험 진행 중 갑자기 느려진다). 되는 커뮤니티는 캐시로 첫 시도에 맞는다.
        transport = await UdpTransportTarget.create((host, port), timeout=1.5, retries=0)
        last_err = None
        # OID 후보 — 스칼라는 인스턴스 `.0` 을 찍어야 SET 이 먹는다.
        # `…3.6`(객체)으로 SET 하면 딱 noAccess 가 난다(지적: 커뮤니티도 RW 인데
        # noAccess). 수동 snmpset 은 `…3.6.0` 을 쓴다. 인스턴스가 없어 보이면
        # `.0` 을 붙인 것도 후보에 넣어, noAccess/noSuchName 이면 그것으로 다시 건다.
        _bare = oid.rstrip(".")
        oid_cands = [oid]
        _last_arc = _bare.rsplit(".", 1)[-1] if "." in _bare else ""
        if _last_arc != "0":
            oid_cands.append(_bare + ".0")
        # 시도 목록을 **한 겹으로 펼친다** — 버전 × 커뮤니티 × OID × 타입.
        # 중첩을 쌓으면 어디서 빠져나왔는지 알 수 없고, 보고하는 오류도 마지막
        # 시도 것이 되어 엉뚱한 곳을 가리킨다(지적: private RW 인데 거부).
        #
        # 버전: 명시했으면 그것만. 아니면 v2c 뒤에 v1 도 본다 — 수동 snmpset 은
        # 버전을 안 주면 흔히 v1 로 나가고, 그것만 쓰기를 받는 장비가 있다.
        ver_cands = [ver] if payload.get("version") else ([ver, "v1"] if ver != "v1" else ["v1"])
        attempts = []
        for _vr in ver_cands:
            for _cm in comm_cands:
                for _od in oid_cands:
                    for _tt in cands:
                        attempts.append((_vr, _cm, _od, _tt))
        _used_oid, _used_comm, _used_ver = oid, community, ver
        _first_err = None       # 원래 OID·첫 커뮤니티의 오류 — 보고는 이걸로
        _tried = []             # 무엇을 어떻게 보냈는지 (진단용)
        _seen_err = {}          # (ver,comm) -> 마지막 오류. 같은 짝을 헛돌지 않게
        _need_zero = False      # noSuchName 을 봤을 때만 `.0` 을 시도한다
        _oid_class = False      # 오류가 **OID 문제**로 보이나 (noSuchName …)
        _acc_class = False      # 오류가 **권한 문제**로 보이나 (noAccess …)
        for _vr, _cm, _od, tt in attempts:
            # **필요할 때만 넓힌다** — 조합을 다 돌면 응답 없는 커뮤니티에서
            # 1.5초씩 먹어 시험이 느려진다(앞서 겪은 것). 규칙:
            #  · `.0` 곁가지는 noSuchName(인스턴스 없음)을 봤을 때만
            #  · 같은 (버전·커뮤니티)에서 wrongType 이 아니면 다른 타입은 무의미
            _prev = _seen_err.get((_vr, _cm))
            # 오류 **갈래대로만** 넓힌다(지적: SET 동작이 이상하다 — 8조합을
            # 헛돌았다). noSuchName 은 OID 문제라 커뮤니티·버전을 바꿔도 소용이
            # 없고, noAccess 는 권한 문제라 OID 를 바꿔도 소용이 없다.
            if _oid_class and (_vr, _cm) != (ver_cands[0], comm_cands[0]):
                continue        # OID 문제 — 커뮤니티·버전은 건드릴 이유가 없다
            if _acc_class and _od != oid:
                continue        # 권한 문제 — `.0` 곁가지는 뜻이 없다
            if _od != oid and not _need_zero:
                continue
            if _prev is not None and "wrongType" not in _prev and tt != cands[0]:
                continue
            _used_oid, _used_comm, _used_ver = _od, _cm, _vr
            try:
                pv = _mkval(tt, value)
            except Exception as ex:
                last_err = str(ex); continue
            auth = CommunityData(_cm, mpModel=(0 if _vr == "v1" else 1))
            errInd, errStat, errIdx, varBinds = await set_cmd(
                eng, auth, transport, ContextData(), ObjectType(ObjectIdentity(_od), pv))
            if errInd:
                return {"ok": False, "error": str(errInd), "output": "[SNMP SET] " + str(errInd)}
            if errStat:
                es = str(errStat.prettyPrint()); last_err = es
                _sig = _vr + "/" + str(_cm) + " " + _od + " (" + _SNMP_TYPE_NAMES.get(tt, tt) + ")"
                if _sig not in _tried:
                    _tried.append(_sig)
                if _first_err is None:
                    _first_err = (es, _od, _cm, _vr, tt)
                _seen_err[(_vr, _cm)] = es
                if "noSuchName" in es or "noSuchInstance" in es:
                    _need_zero = True     # 인스턴스 문제 — `.0` 을 붙여 볼 값이 있다
                    _oid_class = True
                elif any(x in es for x in ("noAccess", "authorizationError", "notWritable", "readOnly")):
                    _acc_class = True
                continue        # 다음 시도로 — 다 해 보고 아래에서 보고한다
            # ── 성공 ──
            lines2 = []
            for vb in varBinds:
                try:
                    lines2.append(vb[0].prettyPrint() + " = " + _snmp_val_str(vb[1]))
                except Exception:
                    lines2.append(str(vb))
            _tn = _SNMP_TYPE_NAMES.get(tt, tt)
            _note = ""
            if _used_oid != oid:
                _note += "\n\u2192 \uc778\uc2a4\ud134\uc2a4 `.0` \uc744 \ubd99\uc5ec \uc131\uacf5\ud588\uc2b5\ub2c8\ub2e4 (" + _used_oid + ")."
            if not _explicit and _used_comm != comm_cands[0]:
                _note += "\n\u2192 \uc4f0\uae30 \ucee4\ubba4\ub2c8\ud2f0 '" + str(_used_comm) + "' \ub85c \ub410\uc2b5\ub2c8\ub2e4. Devices \uc5d0 \ub123\uc5b4 \ub450\uba74 \ub2e4\uc74c\ubd80\ud134 \ubc14\ub85c \ub429\ub2c8\ub2e4."
            if _used_ver != ver:
                _note += "\n\u2192 SNMP " + _used_ver + " \ub85c \ub410\uc2b5\ub2c8\ub2e4 (v2c \ub294 \uac70\ubd80). \uc7a5\ube44 SNMP \uc124\uc815\uc758 \ubc84\uc804\uc744 " + _used_ver + " \ub85c \ub450\uc138\uc694."
            if not _explicit:
                _SNMP_WCOMM_CACHE[host] = _used_comm
            return {"ok": True, "output": "[SNMP SET OK] (type=" + _tn + ")\n" + ("\n".join(lines2) if lines2 else (_used_oid + " = " + value)) + _note, "mode": "set"}

        # ── 다 실패 ── 원래 OID·첫 시도의 오류로 보고한다(마지막 것은 `.0` 등 곁가지다)
        if _first_err:
            es, _eo, _ec, _ev2, _et = _first_err
            _tnn = _SNMP_TYPE_NAMES.get(_et, _et)
            _hint = "\n\u2192 \ubcf4\ub0b8 \uac12: [" + str(value) + "] \ud0c0\uc785: " + _tnn
            _hint += "\n\u2192 \ubcf4\ub0b8 OID: " + _eo + " · \ucee4\ubba4\ub2c8\ud2f0: " + str(_ec) + " · \ubc84\uc804: " + _ev2
            try:
                _ps = oid.split("."); _em2 = None
                for _cut in (1, 2, 0):
                    _cand = ".".join(_ps[: len(_ps) - _cut]) if _cut else oid
                    if SNMP_ENUM_MAP.get(_cand):
                        _em2 = SNMP_ENUM_MAP[_cand]; break
                if _em2:
                    _hint += "\n\u2192 \uc720\ud6a8\uac12: " + ", ".join(nm + "(" + k + ")" for k, nm in sorted(_em2.items(), key=lambda x: int(x[0])))
            except Exception:
                pass
            if "wrongType" in es:
                _hint += "\n\u2192 \ud0c0\uc785 \ubd88\uc77c\uce58. [i:" + value + "]\u00b7[u:" + value + "]\u00b7[s:..]\u00b7[x:HEX] \ub85c \uc9c0\uc815 \uac00\ub2a5"
            elif "noSuchName" in es or "noSuchInstance" in es:
                # 있는 번호를 실제로 물어봐서 알려 준다 — 「없다」 만으로는
                # 무슨 번호를 써야 할지 알 수 없다(지적: 인덱스가 101·1003…)
                try:
                    _col = oid.rstrip(".").rsplit(".", 1)[0]
                    _have = await _snmp_instances(host, _ec, (0 if _ev2 == "v1" else 1), _col)
                    if _have:
                        _hint += ("\n\u2192 \uc774 \uc5f4\uc5d0 **\uc2e4\uc81c\ub85c \uc788\ub294 \ubc88\ud638**: "
                                  + " \u00b7 ".join(_have) + " \u2026  \ubc18\ubcf5\uc744 \uc774 \uac12\uc73c\ub85c \ub450\uc138\uc694(\ubaa9\ub85d \ubc29\uc2dd).")
                except Exception:
                    pass
                _hint += ("\n\u2192 \uc774 \uc7a5\ube44\ub294 **\uadf8 \ubc88\ud638\uc5d0 \uc4f0\uae30\ub97c \uc548 \ubc1b\uc2b5\ub2c8\ub2e4**(" + es + "). "
                          "\uc77d\uae30(GET)\ub294 \ub418\ub294\ub370 SET \ub9cc \uc774\ub7ec\uba74, \uadf8 \ubc88\ud638\uac00 \uc4f0\uae30 \ub300\uc0c1\uc774 \uc544\ub2c8\uac70\ub098 "
                          "CLI \ud3ec\ud2b8 \ubc88\ud638\uc640 SNMP ifIndex \uac00 \ub2e4\ub978 \uacbd\uc6b0\uc785\ub2c8\ub2e4 \u2014 \uc218\ub3d9\uc73c\ub85c \ub41c \ubc88\ud638\uc640 \uacac\uc918 \ubcf4\uc138\uc694.")
            elif any(x in es for x in ("noAccess", "authorizationError", "notWritable", "readOnly")):
                _hint += ("\n\u2192 \uc7a5\ube44\uac00 \uc4f0\uae30\ub97c \uac70\ubd80\ud588\uc2b5\ub2c8\ub2e4(" + es + "). \uc218\ub3d9 snmpset \uc774 \ub41c\ub2e4\uba74 \uadf8\ub54c\uc758 "
                          "**OID\u00b7\ucee4\ubba4\ub2c8\ud2f0\u00b7\ubc84\uc804**\uc744 \uc704 \uc904\uacfc \uacac\uc918 \ubcf4\uc138\uc694 \u2014 \ud558\ub098\ub77c\ub3c4 \ub2e4\ub974\uba74 \uadf8\uac83\uc774 \uae30\uc900\uc785\ub2c8\ub2e4. "
                          "\uc7a5\ube44 \ucabd ACL(\ud5c8\uc6a9 IP)\uc774 \uc788\uc73c\uba74 \uc774 \uc11c\ubc84 IP \ub3c4 \ub123\uc5b4\uc57c \ud569\ub2c8\ub2e4.")
            elif "genErr" in es:
                _hint += "\n\u2192 genErr = \uc7a5\ube44\uac00 SET \uac70\ubd80. \ud574\ub2f9 \ud3ec\ud2b8 \uc0c1\ud0dc\u00b7\uc4f0\uae30\uad8c\ud55c\uc744 \ud655\uc778\ud558\uc138\uc694"
            if len(_tried) > 1:
                _hint += "\n\u2192 \uc2dc\ub3c4: " + " · ".join(_tried[:8]) + ("  \u2026" if len(_tried) > 8 else "") + " (\ub2e4 \uac70\ubd80)"
            return {"ok": False, "error": es, "output": "[SNMP SET \uc2e4\ud328] " + es + _hint}
        return {"ok": False, "error": last_err or "SET 실패", "output": "[SNMP SET 오류] " + str(last_err or "")}
    except Exception as e:
        _msg = str(e)
        if "No module named" in _msg and ("pysnmp" in _msg or "pyasn1" in _msg):
            _msg = "pysnmp 미설치 — 'python -m pip install pysnmp' 후 서버 재시작"
        _snmp_engine_reset()   # 망가졌을 수 있다 — 버리고 다음에 새로 만든다
        return {"ok": False, "error": _msg[:300], "output": "[SNMP SET 오류] " + _msg[:220]}

# ── SNMP Trap 수신기 (장비가 보내는 Notification 수신·판정용) ──
_TRAP_BUF = []           # [{ts, from, oid, varbinds:[{oid,value}]}]
_TRAP_LOCK = _threading.Lock()
_trap_state = {"started": False, "error": "", "port": 162}

def _trap_listener_thread(port):
    try:
        import asyncio
        from pysnmp.entity import engine, config
        from pysnmp.carrier.asyncio.dgram import udp
        from pysnmp.entity.rfc3413 import ntfrcv
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        snmpEngine = engine.SnmpEngine()
        config.add_transport(snmpEngine, udp.DOMAIN_NAME,
                             udp.UdpTransport().open_server_mode(('0.0.0.0', port)))
        # v1/v2c community (수신은 community 검증 느슨하게 — 흔한 public/private 등록)
        for comm in ("public", "private", "ubiquoss"):
            try:
                config.add_v1_system(snmpEngine, "utop-" + comm, comm)
            except Exception:
                pass

        def cbFun(snmpEngine, stateReference, contextEngineId, contextName, varBinds, cbCtx):
            src = ""
            try:
                td, ta = snmpEngine.message_dispatcher.get_transport_info(stateReference)
                src = str(ta[0])
            except Exception:
                pass
            vbs, trap_oid = [], ""
            for oid, val in varBinds:
                try:
                    o = oid.prettyPrint(); v = val.prettyPrint()
                except Exception:
                    o, v = str(oid), str(val)
                vbs.append({"oid": o, "value": v})
                if o.endswith("1.3.6.1.6.3.1.1.4.1.0"):  # snmpTrapOID.0
                    trap_oid = v
            with _TRAP_LOCK:
                _TRAP_BUF.append({"ts": _t.time(), "from": src, "oid": trap_oid, "varbinds": vbs})
                if len(_TRAP_BUF) > 500:
                    del _TRAP_BUF[:len(_TRAP_BUF) - 500]

        ntfrcv.NotificationReceiver(snmpEngine, cbFun)
        snmpEngine.transport_dispatcher.job_started(1)
        _trap_state["started"] = True
        _trap_state["error"] = ""
        snmpEngine.transport_dispatcher.run_dispatcher()
    except Exception as e:
        _trap_state["error"] = str(e)[:300]
        _trap_state["started"] = False

def _ensure_trap_listener(port):
    if _trap_state.get("started"):
        return True
    _trap_state["port"] = port
    th = _threading.Thread(target=_trap_listener_thread, args=(port,), daemon=True)
    th.start()
    for _ in range(25):
        if _trap_state.get("started"):
            return True
        if _trap_state.get("error"):
            return False
        _t.sleep(0.1)
    return _trap_state.get("started", False)





@router.post("/api/snmp-trap/wait")
async def snmp_trap_wait(payload: dict):
    import asyncio
    oid = (payload.get("oid") or "").strip()
    try:
        timeout = float(payload.get("timeout", 15) or 15)
    except Exception:
        timeout = 15
    try:
        port = int(payload.get("port", 162) or 162)
    except Exception:
        port = 162
    ok = _ensure_trap_listener(port)
    if not ok:
        return {"ok": False, "error": "Trap 수신기 시작 실패: " + (_trap_state.get("error") or ("UDP " + str(port) + " 바인드 불가 — 관리자 권한 또는 포트 사용중 확인"))}
    with _TRAP_LOCK:
        base = len(_TRAP_BUF)
    start = _t.time()
    while _t.time() - start < timeout:
        with _TRAP_LOCK:
            for tr in _TRAP_BUF[base:]:
                if (not oid) or (oid in (tr.get("oid") or "")) or any(oid in (v.get("oid") or "") for v in tr.get("varbinds", [])):
                    return {"ok": True, "trap": tr}
        await asyncio.sleep(0.3)
    return {"ok": True, "trap": None, "error": "timeout"}

CYCLE_META_KEYS = ("id","name","model","version","version_group","folder_id","assignee","start_date","end_date","mail_send","created_at","updated_at")

def _cycle_item_meta_lite(it: dict) -> dict:
    """UI 목록·판정 집계에 필요한 최소 필드만.
    result 값 카운트로만 집계 → steps 배열 자체를 안 보내고 pass/fail/total 3개 숫자만 반환."""
    m = {k: it.get(k) for k in ("tcid","name","req_id","severity","priority","assignee","devId","devName","executed_by","executed_at","executed_auto","issues")}
    _stp = it.get("steps") or []
    _p = 0; _f = 0; _o = 0
    for s in _stp:
        r = s.get("result") or ""
        if r == "Pass": _p += 1
        elif r == "Fail": _f += 1
        elif r: _o += 1
    m["_steps_count"] = len(_stp)
    m["_steps_pass"] = _p
    m["_steps_fail"] = _f
    m["_steps_other"] = _o
    # 각 step 은 판정 집계에 필요한 최소 필드만 (result, action, manual, cli 첫줄).
    # output/verdictMsg 등 무거운 필드는 완전 제외.
    def _lite(s):
        return {
            "result": s.get("result",""),
            "action": s.get("action",""),
            "manual": bool(s.get("manual")),
        }
    m["steps"] = [_lite(s) for s in _stp]
    return m

def _cycle_meta_extra(meta: dict, d: dict):
    _items = d.get("items") or []
    meta["items"] = [_cycle_item_meta_lite(it) for it in _items]

@router.get("/api/cycle")
async def get_all_cycles(meta: int = 0):
    """
    meta=1 : 목록·판정 집계에 필요한 필드만 반환 (각 item.steps 에서 output/verdictMsg 등 큰 필드 제거)
    meta=0 (기본): 전체 반환
    """
    if meta:
        # meta 모드: cycle.data - items (items 는 통째 제외). 프론트가 다시 loadCycleFull 로 개별 로드.
        return {"cycles": await db.cycle_list_meta()}
    return {"cycles": await db.cycle_list_full()}

# ───────────────────────────────────────────
# 플랜 트리 집계 — 폴더 한 층의 현황을 **서버가** 센다.
#
# 여태 화면이 회차·항목을 다 받아 브라우저에서 셌다. 사업자 층은 수천
# 건이라 트리 위로 갈수록 느려진다. 여기서 한 번에 세어 내려준다.
#
# 트리 경로는 화면(pathOfCycle)과 **같은 규칙**이다:
#   Root/사업자/제품군/모델그룹/모델명/버전그룹
# 폴더를 손으로 정해 둔 회차는 Root/<그 경로> 에 그대로 붙는다.
# ───────────────────────────────────────────
_RU_ROOT = "Root"
_RU_NO_CUST = "(사업자 없음)"
_RU_NO_CAT = "(카탈로그에 없는 모델)"
_RU_NO_MGROUP = "(모델그룹 없음)"


_RU_NO_GROUP = "(버전그룹 없음)"
_RU_LEVELS = ["root", "operator", "family", "model_group", "model", "version_group", "cycle"]


def _ru_path(c: dict, fam: dict, mgrp: dict) -> str:
    own = str(c.get("folder") or "").strip().strip("/")
    if own:
        return f"{_RU_ROOT}/{own}"
    model = str(c.get("model") or "").strip() or "(모델 없음)"
    cust = str(c.get("customer") or "").strip() or _RU_NO_CUST
    f = (fam.get(model) or "(제품군 없음)") if model in fam else _RU_NO_CAT
    mg = str(c.get("model_group") or "").strip() or mgrp.get(model) or _RU_NO_MGROUP
    vg = str(c.get("version_group") or "").strip() or _RU_NO_GROUP
    return f"{_RU_ROOT}/{cust}/{f}/{mg}/{model}/{vg}"


def _ru_day(s) -> str:
    """항목이 남긴 시각에서 날짜만 — 「2026-08-19T14:21」 → 「2026-08-19」"""
    t = str(s or "")[:10]
    return t if len(t) == 10 and t[4] == "-" else ""


async def _ru_groups() -> dict:
    """판정 → 집계 계열. 설정 「실행 판정 기준」 이 정본이다."""
    g = {"Pass": "pass", "Fail": "fail", "": "none"}
    try:
        for it in await db.code_list("cycle_result"):
            v = str(it.get("value") or "")
            try:
                meta = json.loads(it.get("note") or "{}")
            except Exception:
                meta = {}
            grp = meta.get("group")
            g[v] = grp if grp in ("pass", "fail") else g.get(v, "neutral")
    except Exception:
        pass
    return g


async def _rollup(path: str = _RU_ROOT, date_from: str = "", date_to: str = "",
                  axis: str = "") -> dict:
    """
    폴더 한 층의 현황. 프리뷰의 KPI·막대·표·추이가 모두 이 하나를 쓴다.

    · `path`      — 「Root/LGUPLUS/L3」 처럼 트리 경로
    · `date_from` / `date_to` — 항목이 실행된 날(YYYY-MM-DD) 로 자른다.
                    비우면 전부. 잘라도 **회차 수·항목 수는 그대로**고,
                    판정 집계와 추이만 그 기간 것으로 센다.

    합격률은 **합격 ÷ (합격+실패)** 다 — 실행한 것 중 합격 비율.
    미실행이 얼마나 남았는지는 진척률(실행/전체)이 따로 말한다.
    """
    base = str(path or _RU_ROOT).strip().strip("/") or _RU_ROOT
    metas = await db.cycle_list_meta()
    cat = await db.catalog_list("model")
    fam = {str(m.get("name") or ""): str(m.get("family") or "").strip() for m in cat}
    mgrp = {str(m.get("name") or ""): str(m.get("model_group") or "").strip() for m in cat}
    grp_of = await _ru_groups()

    depth = len(base.split("/"))
    level = _RU_LEVELS[depth] if depth < len(_RU_LEVELS) else "cycle"

    def tally() -> dict:
        return {"n": 0, "pass": 0, "fail": 0, "other": 0, "none": 0, "cycles": 0,
                "last_run": "", "open_defects": 0}

    total = tally()
    kids: dict[str, dict] = {}
    axes: dict[str, dict] = {}
    trend: dict[str, dict] = {}
    rows: list[dict] = []

    for c in metas:
        p = _ru_path(c, fam, mgrp)
        if p != base and not p.startswith(base + "/"):
            continue
        rest = p[len(base):].strip("/")
        key = rest.split("/")[0] if rest else (str(c.get("cid") or c.get("id") or ""))
        kid = kids.setdefault(key, {**tally(), "key": key, "leaf": not rest})
        kid["cycles"] += 1
        total["cycles"] += 1

        # 축 열쇠 — 「무엇으로 나눠 볼까」. 회차에서 오는 것과 항목에서
        # 오는 것이 있어 둘 다 받는다.
        cyc_key = {
            "cycle": str(c.get("cid") or c.get("name") or c.get("id") or "–"),
            "version_group": str(c.get("version_group") or "(버전그룹 없음)"),
            "model": str(c.get("model") or "(모델 없음)"),
            "customer": str(c.get("customer") or "(고객 없음)"),
            "status": str(c.get("status") or "(상태 없음)"),
        }.get(axis, "")

        cy = tally()
        for it in (c.get("items") or []):
            if not isinstance(it, dict):
                continue
            day = _ru_day(it.get("executed_at"))
            if date_from and day and day < date_from:
                continue
            if date_to and day and day > date_to:
                continue
            v = str(it.get("_verdict") or it.get("result") or "")
            g = grp_of.get(v, "neutral" if v else "none")
            cy["n"] += 1
            cy[g if g in ("pass", "fail", "none") else "other"] += 1
            if day and day > cy["last_run"]:
                cy["last_run"] = day
            if g in ("pass", "fail") and day:
                wk = trend.setdefault(day[:7] + "-" + str((int(day[8:10]) - 1) // 7 + 1),
                                      {"k": "", "pass": 0, "fail": 0})
                wk["k"] = day
                wk[g] += 1
            if it.get("issues"):
                cy["open_defects"] += len(it.get("issues") or [])

            if axis:
                if cyc_key:
                    ak = cyc_key
                else:
                    raw = it.get("severity") if axis == "severity" else it.get("assignee")
                    ak = str(raw or "").strip() or "(없음)"
                ax = axes.setdefault(ak, {**tally(), "key": ak})
                ax["n"] += 1
                ax[g if g in ("pass", "fail", "none") else "other"] += 1
                if day and day > ax["last_run"]:
                    ax["last_run"] = day

        for f in ("n", "pass", "fail", "other", "none", "open_defects"):
            kid[f] += cy[f]
            total[f] += cy[f]
        if cy["last_run"] > kid["last_run"]:
            kid["last_run"] = cy["last_run"]
        if cy["last_run"] > total["last_run"]:
            total["last_run"] = cy["last_run"]

        if not rest:  # 이 층이 곧 회차 목록이다(버전그룹 아래)
            rows.append({
                "id": c.get("id"), "cid": c.get("cid"), "name": c.get("name"),
                "version": c.get("version"), "version_group": c.get("version_group"),
                "model": c.get("model"), "status": c.get("status"),
                "assignee": c.get("assignee"), "end_date": c.get("end_date"),
                **{k: cy[k] for k in ("n", "pass", "fail", "other", "none", "last_run")},
            })

    def pct(t: dict) -> dict:
        done = t["pass"] + t["fail"]
        t["pass_rate"] = round(t["pass"] / done * 100) if done else 0
        t["progress"] = round((t["n"] - t["none"]) / t["n"] * 100) if t["n"] else 0
        return t

    return {
        "path": base,
        "level": level,
        "totals": pct(total),
        "children": sorted((pct(k) for k in kids.values()), key=lambda x: (x["pass_rate"], -x["n"])),
        "axis": axis,
        "groups": sorted((pct(a) for a in axes.values()), key=lambda x: (x["pass_rate"], -x["n"])),
        "cycles": rows,
        "trend": [
            {"at": v["k"], "pass": v["pass"], "fail": v["fail"],
             "pass_rate": round(v["pass"] / (v["pass"] + v["fail"]) * 100) if (v["pass"] + v["fail"]) else 0}
            for _k, v in sorted(trend.items())
        ],
    }


@router.get("/api/cycle/rollup")
async def cycle_rollup_get(path: str = _RU_ROOT, date_from: str = "", date_to: str = "",
                           axis: str = ""):
    """
    폴더 한 층의 현황 — 화면(KPI·막대·추이·표)이 이 하나를 쓴다.

    `axis` 를 주면 **하위 폴더 대신 그것으로 나눈** 막대를 함께 내려준다:
    cycle · version_group · model · customer · status · severity · assignee.
    (옛 Reports 의 「축 갈아끼우기」 가 이 자리로 왔다)
    """
    return await _rollup(path, date_from, date_to, axis)


@router.get("/api/cycle/rollup/items")
async def cycle_rollup_items(
    path: str = _RU_ROOT,
    date_from: str = "",
    date_to: str = "",
    q: str = "",
    kind: str = "",
    severity: str = "",
    cycle: str = "",
    verdict: str = "",
    limit: int = 20,
    offset: int = 0,
):
    """
    결과 상세 — 이 폴더에 걸린 **항목 한 줄씩**. 옛 Reports 의 아래 표다.
    거르개: 찾기 · 타입(auto·manual) · 심각도 · 플랜 · 판정 · 기간.
    """
    metas = await db.cycle_list_meta()
    cat = await db.catalog_list("model")
    fam = {str(m.get("name") or ""): str(m.get("family") or "").strip() for m in cat}
    mgrp = {str(m.get("name") or ""): str(m.get("model_group") or "").strip() for m in cat}
    grp_of = await _ru_groups()
    base = str(path or _RU_ROOT).strip().strip("/") or _RU_ROOT
    ql = q.strip().lower()

    out: list[dict] = []
    cycles_seen: list[dict] = []
    for c in metas:
        p = _ru_path(c, fam, mgrp)
        if p != base and not p.startswith(base + "/"):
            continue
        cid = str(c.get("cid") or c.get("id") or "")
        cnm = str(c.get("name") or cid)
        cycles_seen.append({"id": cid, "name": cnm})
        if cycle and cycle not in (cid, cnm):
            continue
        for it in (c.get("items") or []):
            if not isinstance(it, dict):
                continue
            day = _ru_day(it.get("executed_at"))
            if date_from and day and day < date_from:
                continue
            if date_to and day and day > date_to:
                continue
            v = str(it.get("_verdict") or it.get("result") or "")
            g = grp_of.get(v, "neutral" if v else "none")
            if verdict and verdict != g:
                continue
            if severity and str(it.get("severity") or "") != severity:
                continue
            if kind:
                steps = it.get("steps") or []
                man = sum(1 for x in steps if isinstance(x, dict) and x.get("manual"))
                aut = len(steps) - man
                k = "manual" if man and not aut else ("auto" if aut and not man else "mixed")
                if k != kind:
                    continue
            if ql:
                hay = f"{it.get('tcid') or ''} {it.get('name') or ''} {it.get('req_id') or ''}".lower()
                if ql not in hay:
                    continue
            out.append({
                "tcid": it.get("tcid"), "name": it.get("name"), "verdict": v, "group": g,
                "severity": it.get("severity"), "req_id": it.get("req_id"),
                "cycle": cnm, "cycle_id": cid,
                "executed_at": it.get("executed_at"),
                "fails": int(it.get("_steps_fail") or 0),
            })

    out.sort(key=lambda x: str(x.get("executed_at") or ""), reverse=True)
    lim = max(1, min(int(limit or 20), 500))
    off = max(0, int(offset or 0))
    seen: dict[str, str] = {}
    for c in cycles_seen:
        seen[c["id"]] = c["name"]
    return {"total": len(out), "rows": out[off:off + lim],
            "cycles": [{"id": k, "name": v} for k, v in seen.items()]}


# ───────────────────────────────────────────
# 보고서 — 같은 집계를 **한 장**으로. PDF 는 화면이 인쇄로 뽑고(같은 그림),
# 메일은 여기서 HTML 로 지어 보낸다. 두 갈래 다 같은 자료다.
# ───────────────────────────────────────────
def _rp_headline(r: dict) -> str:
    """메일 첫 문단 — 그대로 읽어도 말이 되게(회차 요약 헤드라인과 같은 결)"""
    t = r["totals"]
    nm = r["path"].split("/")[-1] or "Root"
    left = t["n"] - t["none"]
    s2 = (f"{nm} 시험 현황입니다. 항목 {t['n']}건 가운데 {left}건을 실행해 "
          f"진척 {t['progress']}%, 합격률 {t['pass_rate']}% (합격 {t['pass']} · 실패 {t['fail']}) 입니다.")
    if t["none"]:
        s2 += f" 아직 {t['none']}건이 남아 있습니다."
    if t["open_defects"]:
        s2 += f" 열린 결함은 {t['open_defects']}건입니다."
    if t["last_run"]:
        s2 += f" 마지막 실행은 {t['last_run']} 입니다."
    return s2


def _rp_html(r: dict, note: str = "") -> str:
    t = r["totals"]
    nm = r["path"].split("/")[-1] or "Root"
    kid_lb = {"root": "사업자", "operator": "제품군", "family": "모델그룹",
              "model_group": "모델명", "model": "버전그룹",
              "version_group": "회차"}.get(r["level"], "하위")

    def bar(x: dict) -> str:
        n = max(1, x["n"])
        seg = [("#16a34a", x["pass"]), ("#dc2626", x["fail"]),
               ("#f0b429", x["other"]), ("#c3cad4", x["none"])]
        cells = "".join(
            f'<td width="{round(v / n * 100)}%" bgcolor="{c}" style="height:8px;font-size:0;line-height:0">&nbsp;</td>'
            for c, v in seg if v
        )
        return f'<table width="150" cellpadding="0" cellspacing="0" style="border-radius:4px;overflow:hidden"><tr>{cells}</tr></table>'

    if r["level"] == "version_group":
        head = ["회차", "버전", "항목", "진행", "합격률"]
        body = "".join(
            f"<tr><td>{c.get('cid') or c.get('id')}</td><td>{c.get('version') or c.get('name') or '–'}</td>"
            f"<td align=right>{c['n']}</td><td>{bar(c)}</td>"
            f"<td align=right><b>{round(c['pass'] / (c['pass'] + c['fail']) * 100) if (c['pass'] + c['fail']) else 0}%</b></td></tr>"
            for c in r["cycles"]
        )
    else:
        head = [kid_lb, "회차", "항목", "진행", "합격률"]
        body = "".join(
            f"<tr><td>{k['key']}</td><td align=right>{k['cycles']}</td><td align=right>{k['n']}</td>"
            f"<td>{bar(k)}</td><td align=right><b>{k['pass_rate']}%</b></td></tr>"
            for k in r["children"]
        )

    kpi = "".join(
        f'<td style="padding:8px 12px;border:1px solid #e3e8ef;border-radius:8px">'
        f'<div style="font-size:11px;color:#9ca3af">{lb}</div>'
        f'<div style="font-size:19px;font-weight:700;color:{col}">{val}</div></td>'
        for lb, val, col in [
            ("합격률", f"{t['pass_rate']}%", "#16a34a" if t["pass_rate"] >= 80 else ("#dc2626" if t["pass_rate"] < 50 else "#1f2937")),
            ("진척률", f"{t['progress']}%", "#1f2937"),
            ("시험 항목", t["n"], "#1f2937"),
            ("열린 결함", t["open_defects"], "#dc2626" if t["open_defects"] else "#1f2937"),
            ("마지막 실행", t["last_run"] or "–", "#1f2937"),
        ]
    )
    note_html = f'<p style="margin:0 0 14px;padding:10px 12px;background:#fffbea;border:1px solid #fde68a;border-radius:8px">{note}</p>' if note else ""
    return f"""<div style="font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans KR',sans-serif;color:#1f2937;font-size:13px;line-height:1.6;max-width:760px">
  <h2 style="margin:0 0 4px;font-size:18px">{nm} 시험 현황</h2>
  <div style="color:#6b7280;font-size:12px;margin-bottom:14px">{r['path']}</div>
  {note_html}
  <p style="margin:0 0 14px">{_rp_headline(r)}</p>
  <table cellspacing="6" cellpadding="0" style="margin:0 0 16px"><tr>{kpi}</tr></table>
  <table cellpadding="6" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:12px">
    <tr style="background:#f5f7fa">{''.join(f'<th align=left style="border-bottom:1px solid #e3e8ef;color:#6b7280;font-size:11px">{h}</th>' for h in head)}</tr>
    {body}
  </table>
  <p style="color:#9ca3af;font-size:11px;margin-top:14px">
    합격률 = 합격 ÷ (합격+실패) · 진척률 = 실행 ÷ 전체 · 색: 합격 초록 · 실패 빨강 · 그 밖 노랑 · 미실행 회색<br>
    ubiQuoss-TOP 이 보낸 자동 요약입니다.
  </p>
</div>"""


@router.get("/api/cycle/rollup/csv")
async def cycle_rollup_csv(
    path: str = _RU_ROOT,
    date_from: str = "",
    date_to: str = "",
    q: str = "",
    kind: str = "",
    severity: str = "",
    cycle: str = "",
    verdict: str = "",
):
    """결과 상세를 원자료 그대로 — 지금 걸린 폴더·기간·거르개가 그대로 나간다."""
    import csv as _csv
    import io as _io
    from urllib.parse import quote

    d = await cycle_rollup_items(path, date_from, date_to, q, kind, severity, cycle,
                                 verdict, limit=100000, offset=0)
    buf = _io.StringIO()
    w = _csv.writer(buf)
    w.writerow(["결과", "TC ID", "시험항목", "부적합", "심각도", "요구사항", "플랜", "실행일"])
    for r in d["rows"]:
        w.writerow([
            {"pass": "합격", "fail": "불합격", "none": "미실행"}.get(r["group"], r["verdict"] or ""),
            r.get("tcid") or "", r.get("name") or "", r.get("fails") or 0,
            r.get("severity") or "", r.get("req_id") or "", r.get("cycle") or "",
            str(r.get("executed_at") or "")[:16].replace("T", " "),
        ])
    nm = (path.split("/")[-1] or "Root").replace(" ", "_")
    # 엑셀이 UTF-8 을 알아보게 BOM 을 붙인다 — 없으면 한글이 깨져 열린다
    body = ("\ufeff" + buf.getvalue()).encode("utf-8")
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(nm)}_result.csv"},
    )


@router.get("/api/cycle/rollup/preview")
async def cycle_rollup_preview(path: str = _RU_ROOT, date_from: str = "", date_to: str = "", note: str = ""):
    """메일로 나갈 그 모습 그대로 — 보내기 전에 눈으로 본다."""
    r = await _rollup(path, date_from, date_to)
    return {"subject": f"[UTOP] {r['path'].split('/')[-1]} 시험 현황",
            "headline": _rp_headline(r), "html": _rp_html(r, note)}


@router.post("/api/cycle/rollup/mail")
async def cycle_rollup_mail(payload: dict):
    """이 폴더의 현황을 메일로 보낸다 — 화면에서 보는 것과 같은 자료다."""
    path = str(payload.get("path") or _RU_ROOT)
    to = payload.get("to") or ""
    if not to:
        raise HTTPException(400, "받는 사람을 적어 주세요")
    r = await _rollup(path, str(payload.get("date_from") or ""), str(payload.get("date_to") or ""))
    subject = str(payload.get("subject") or "").strip() or f"[UTOP] {path.split('/')[-1]} 시험 현황"
    html = _rp_html(r, str(payload.get("note") or "").strip())
    try:
        sent = core.send_mail(to, subject, html, html=True)
    except Exception as e:
        raise HTTPException(400, f"보내지 못했습니다 — {e}")
    return {"success": True, "to": sent, "subject": subject}


def _mail_safe_html(html: str) -> str:
    """메일에 실을 HTML 을 한 번 더 거른다.

    화면(DOMPurify)이 이미 걸렀지만 그것은 **보내는 쪽 브라우저**의 일이다.
    이 자리는 남의 메일함으로 나가는 마지막 문이라, 서버도 제 눈으로 본다.
    """
    out = core.MAIL_BAD_TAG.sub("", str(html or ""))
    out = core.MAIL_BAD_ATTR.sub("", out)
    out = core.MAIL_BAD_URL.sub(r"\1=\2#", out)
    return out


async def _cycle_mail_html(cycle_id: str, note: str = "", body_html: str = "") -> tuple[str, str]:
    """(제목, HTML) — **내용 칸에 있는 것만 싣는다**(지시).

    여태는 사람이 쓴 글 뒤에 서버가 통계 카드·항목 표·AI 총평을 덧붙였다.
    그런데 Test Summary 글 자체가 이미 제목·총평·현황 표를 갖춘 완성된
    보고서다 — 같은 것을 두 번 싣는 꼴이라, 받는 쪽은 어느 쪽을 읽어야
    할지 모른다(지적: 다른 포맷도 같이 있다). 틀은 사람이 쓴 글에 맡긴다.

    `body_html` 은 화면이 marked 로 만들고 DOMPurify 로 소독한 HTML 이다.
    여기서도 한 번 더 거른다: 남이 보낸 것을 그대로 메일에 싣지 않는다.
    """
    c = await db.cycle_get(cycle_id)
    if not c:
        raise HTTPException(404, "플랜을 찾을 수 없습니다")
    subject = f"[UTOP] {c.get('name') or c.get('cid') or cycle_id} 시험 결과"
    if body_html:
        inner = _mail_safe_html(body_html)
    elif note:
        inner = (
            f"<div style='background:#fff8e6;border:1px solid #eadfa8;border-radius:8px;"
            f"padding:8px 12px;font-size:12px'>{_h.escape(note)}</div>"
        )
    else:
        inner = ""
    html = (
        f"<div style='font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;"
        f"color:#1a2530;font-size:13px;line-height:1.7'>{inner}</div>"
    )
    return subject, html


@router.get("/api/cycle/{cycle_id}/mail-preview")
async def cycle_mail_preview(cycle_id: str, note: str = "", token: str = ""):
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    subject, html = await _cycle_mail_html(cycle_id, note)
    return {"subject": subject, "html": html}


def _blocks_to_md(doc) -> str:
    """블록 노트(description_doc) → 마크다운. 메일 창이 글을 못 찾을 때 쓴다.

    문단·제목·목록·표만 옮긴다. 메일 첫 글로 쓸 초안이라 이만하면 된다 —
    사람이 창에서 더 고친다.
    """
    if isinstance(doc, str):
        try:
            doc = json.loads(doc)
        except Exception:
            return ""
    if not isinstance(doc, list):
        return ""

    def txt(x) -> str:
        if isinstance(x, str):
            return x
        if isinstance(x, list):
            return "".join(txt(i) for i in x)
        if isinstance(x, dict):
            if x.get("type") == "text":
                return str(x.get("text") or "")
            if x.get("type") == "link":
                return txt(x.get("content"))
            return txt(x.get("content"))
        return ""

    out: list[str] = []
    for b in doc:
        if not isinstance(b, dict):
            continue
        kind = str(b.get("type") or "")
        props = b.get("props") or {}
        if kind == "table":
            rows = ((b.get("content") or {}).get("rows")) or []
            cells = [[txt(cl).strip() for cl in (r.get("cells") or [])] for r in rows if isinstance(r, dict)]
            cells = [r for r in cells if r]
            if cells:
                out.append("| " + " | ".join(cells[0]) + " |")
                out.append("| " + " | ".join("---" for _ in cells[0]) + " |")
                for r in cells[1:]:
                    out.append("| " + " | ".join(r) + " |")
                out.append("")
            continue
        t = txt(b.get("content")).strip()
        if not t:
            out.append("")
            continue
        if kind == "heading":
            lv = int(props.get("level") or 2)
            out.append("#" * max(1, min(4, lv)) + " " + t)
        elif kind == "bulletListItem":
            out.append("- " + t)
        elif kind == "numberedListItem":
            out.append("1. " + t)
        elif kind == "checkListItem":
            out.append(("- [x] " if props.get("checked") else "- [ ] ") + t)
        else:
            out.append(t)
    return "\n".join(out).strip()




# BlockNote 가 쓰는 색 이름 → 실제 색. **그 판의 CSS 에서 그대로 떠 왔다.**
# 메일에는 CSS 를 실을 수 없어(대부분의 메일 프로그램이 <style> 을 지운다) 색을
# 그 자리에 박아야 한다. 우리가 색을 새로 고르면 화면과 메일이 달라 보인다.
_BN_BG = {
    "gray": "#ebeced", "brown": "#e9e5e3", "red": "#fbe4e4", "orange": "#f6e9d9",
    "yellow": "#fbf3db", "green": "#ddedea", "blue": "#ddebf1", "purple": "#eae4f2",
    "pink": "#f4dfeb",
}
_BN_FG = {
    "gray": "#9b9a97", "brown": "#64473a", "red": "#e03e3e", "orange": "#d9730d",
    "yellow": "#dfab01", "green": "#4d6461", "blue": "#0b6e99", "purple": "#6940a5",
    "pink": "#ad1a72",
}


def _blocks_to_html(doc) -> str:
    """블록 노트(description_doc) → HTML. **서식을 살려서.**

    마크다운을 거치면 칸 배경과 글자색이 사라진다 — 마크다운에 그 문법이 없다.
    표 줄에 색을 칠해 두었는데 메일 창에서는 안 보인다는 지적이 그것이다.
    정본은 블록이므로 여기서 바로 HTML 로 옮긴다.

    빈 글이면 빈 문자열을 돌려준다 — 부른 쪽이 옛 마크다운 길로 되돌아간다.
    """
    if isinstance(doc, str):
        try:
            doc = json.loads(doc)
        except Exception:
            return ""
    if not isinstance(doc, list) or not doc:
        return ""

    def style_of(st) -> str:
        """글자 하나에 걸린 꾸밈 → style 속성 값"""
        css = []
        bg = str((st or {}).get("backgroundColor") or "")
        fg = str((st or {}).get("textColor") or "")
        if bg and bg != "default":
            css.append("background-color:" + _BN_BG.get(bg, bg))
        if fg and fg != "default":
            css.append("color:" + _BN_FG.get(fg, fg))
        return ";".join(css)

    def inline(x) -> str:
        if isinstance(x, str):
            return _h.escape(x)
        if isinstance(x, list):
            return "".join(inline(i) for i in x)
        if not isinstance(x, dict):
            return ""
        kind = str(x.get("type") or "")
        if kind == "link":
            inner = inline(x.get("content"))
            href = _h.escape(str(x.get("href") or ""), quote=True)
            return f'<a href="{href}">{inner}</a>' if href else inner
        if kind and kind != "text":
            return inline(x.get("content"))
        s = _h.escape(str(x.get("text") or ""))
        if not s:
            return ""
        st = x.get("styles") or {}
        if st.get("code"):
            s = f"<code>{s}</code>"
        if st.get("bold"):
            s = f"<b>{s}</b>"
        if st.get("italic"):
            s = f"<i>{s}</i>"
        if st.get("underline"):
            s = f"<u>{s}</u>"
        if st.get("strike"):
            s = f"<s>{s}</s>"
        cs = style_of(st)
        return f'<span style="{cs}">{s}</span>' if cs else s

    def props_css(props, base=()) -> str:
        """블록·칸에 **통째로** 걸린 꾸밈 → style 값.

        글자 하나하나가 아니라 문단·제목·칸 자체에 색을 칠할 수 있다(BlockNote 는
        그것을 props 에 담는다). 이것을 빼면 문단에 칠한 색이 메일에서 사라진다.
        """
        css = list(base)
        bg = str((props or {}).get("backgroundColor") or "")
        if bg and bg != "default":
            css.append("background-color:" + _BN_BG.get(bg, bg))
        fg = str((props or {}).get("textColor") or "")
        if fg and fg != "default":
            css.append("color:" + _BN_FG.get(fg, fg))
        al = str((props or {}).get("textAlignment") or "")
        if al in ("center", "right", "justify"):
            css.append("text-align:" + al)
        return ";".join(x for x in css if x)

    def bgcolor_attr(props) -> str:
        """옛 메일 프로그램(특히 Outlook)은 style 을 흘려버린다 — bgcolor 도 같이 준다"""
        bg = str((props or {}).get("backgroundColor") or "")
        if not bg or bg == "default":
            return ""
        return f' bgcolor="{_BN_BG.get(bg, bg)}"'

    _TB = "border-collapse:collapse;margin:10px 0;font-size:12px"
    _CELL = "padding:6px 10px;border:1px solid #e5eaee"
    _HEAD = "background:#f4f6f8;font-weight:700;white-space:nowrap"

    def table_html(b) -> str:
        content = b.get("content")
        if not isinstance(content, dict):
            return ""
        rows = content.get("rows") or []
        try:
            head_n = int(content.get("headerRows") or 0)
        except Exception:
            head_n = 0
        # 머리줄을 안 밝혔으면 첫 줄을 머리로 본다 — 마크다운 표에서 오던 글과
        # 같은 모양이 되도록(그쪽은 첫 줄이 늘 머리다).
        if not head_n and rows:
            head_n = 1
        out = [f'<table style="{_TB}">']
        for ri, r in enumerate(rows):
            if not isinstance(r, dict):
                continue
            is_head = ri < head_n
            out.append("<tr>")
            for cl in (r.get("cells") or []):
                props = cl.get("props") if isinstance(cl, dict) else None
                props = props or {}
                # 칸에 칠한 색이 머리 바탕(_HEAD)보다 뒤에 온다 — 사람이 일부러
                # 칠한 것이 이겨야 한다.
                base = [_CELL, _HEAD] if is_head else [_CELL]
                cs = props_css(props, base)
                span = bgcolor_attr(props)
                for k, at in (("colspan", "colspan"), ("rowspan", "rowspan")):
                    try:
                        v = int(props.get(k) or 1)
                    except Exception:
                        v = 1
                    if v > 1:
                        span += f' {at}="{v}"'
                body = inline(cl.get("content") if isinstance(cl, dict) else cl) or "&nbsp;"
                tag = "th" if is_head else "td"
                out.append(f'<{tag} style="{cs}"{span}>{body}</{tag}>')
            out.append("</tr>")
        out.append("</table>")
        return "".join(out)

    out: list[str] = []
    ul_open = False

    def close_ul():
        nonlocal ul_open
        if ul_open:
            out.append("</ul>")
            ul_open = False

    for b in doc:
        if not isinstance(b, dict):
            continue
        kind = str(b.get("type") or "")
        props = b.get("props") or {}
        if kind == "table":
            close_ul()
            out.append(table_html(b))
            continue
        if kind == "image":
            # **그림을 버리지 않는다.** 구성도를 붙여 넣어도 메일 창에서는 사라지고
            # 있었다 — 그림 블록은 content 가 비어 있어 아래 「빈 줄이면 건너뛰기」
            # 에 걸렸다. 주소는 /api/req-images/… 꼴이고 그 길은 로그인 없이 열린다.
            close_ul()
            url = str(props.get("url") or "").strip()
            if url:
                cap = _h.escape(str(props.get("caption") or ""))
                try:
                    pw = int(props.get("previewWidth") or 0)
                except Exception:
                    pw = 0
                wa = f' width="{pw}"' if pw > 0 else ""
                out.append(f'<img src="{_h.escape(url, quote=True)}" alt="{cap}"{wa}'
                           f' style="max-width:100%;height:auto">')
                if cap:
                    out.append(f'<div style="font-size:11px;color:#667;margin:2px 0 8px">{cap}</div>')
            continue
        body = inline(b.get("content"))
        if kind in ("bulletListItem", "numberedListItem", "checkListItem"):
            if not ul_open:
                out.append('<ul style="margin:6px 0;padding-left:20px">')
                ul_open = True
            mark = ""
            if kind == "checkListItem":
                mark = "☑ " if props.get("checked") else "☐ "
            out.append(f'<li style="{props_css(props)}">{mark}{body}</li>')
            continue
        close_ul()
        if not body.strip():
            continue
        # 문단·제목에도 **통째로** 색을 칠할 수 있다. 이것을 빼면 문단에 칠해 둔
        # 색이 메일에서만 사라진다(실제로 그렇게 저장된 글이 이미 있다).
        if kind == "heading":
            try:
                lv = int(props.get("level") or 2)
            except Exception:
                lv = 2
            lv = min(3, max(2, lv))
            hs = {2: "margin:16px 0 6px;font-size:15px", 3: "margin:14px 0 5px;font-size:13px"}[lv]
            cs = props_css(props, [hs, "font-weight:700"])
            out.append(f'<h{lv} style="{cs}"{bgcolor_attr(props)}>{body}</h{lv}>')
        else:
            cs = props_css(props, ["margin:6px 0"])
            out.append(f'<p style="{cs}"{bgcolor_attr(props)}>{body}</p>')
    close_ul()
    return "".join(out)


@router.get("/api/cycle/{cycle_id}/summary-body")
async def cycle_summary_body(cycle_id: str, token: str = ""):
    """메일 창이 **처음 채워 넣을 글**과 자동 제목.

    사람이 Test Summary 에 이미 정리해 둔 글이 있는데, 메일 창을 빈 칸으로
    열면 아무도 다시 쓰지 않는다 — 그 글을 그대로 들고 시작한다.
    설명은 마크다운이라 여기서 아주 얕게만 HTML 로 옮긴다(제목·목록·빈 줄).
    화면이 그 글을 고쳐 body_html 로 돌려주고, 보낼 때 서버가 메일 틀에 넣는다.
    """
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    c = await db.cycle_get(cycle_id) or {}

    # **블록이 있으면 블록에서 바로 옮긴다.**
    #
    # 정본은 description_doc 이고 마크다운(description)은 그 곁사본이다. 마크다운을
    # 거치면 **칸 배경과 글자색이 사라진다** — 마크다운에 그 문법이 없다. 표 줄에
    # 색을 칠해 두었는데 메일 창에서는 안 보인다는 지적이 그것이다.
    #
    # AI 생성 직후처럼 블록이 비고 마크다운에만 글이 있을 때가 있어(그쪽은
    # description_doc 을 빈 배열로 둔다), 블록이 비면 아래 옛 길로 내려간다.
    _direct = _blocks_to_html(c.get("description_doc"))
    if _direct:
        # 제목은 **아래 길과 같은 곳**에서 얻는다 — 설정(메일 제목 틀)을 따라야
        # 한다. 여기서 따로 지으면 블록이 있을 때만 제목이 달라진다.
        _subj, _ = await _cycle_mail_html(cycle_id, "", "")
        return {"html": _direct, "subject": _subj}

    md = str(c.get("description") or "").strip()
    # 글이 블록에만 있으면 거기서 뽑는다(지적: 213 에서는 들어가 있는데 253 에서는
    # 빈 칸으로 나온다) — 위 블록 길이 막혔을 때의 마지막 보루다.
    if not md:
        md = _blocks_to_md(c.get("description_doc"))
    import re as _re

    def _ln(t: str) -> str:
        t = _h.escape(t)
        t = _re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", t)
        t = _re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
        return t

    lines = md.split("\n")
    out: list[str] = []
    ul = False
    i = 0
    while i < len(lines):
        t = lines[i].rstrip()
        i += 1
        if not t.strip():
            if ul:
                out.append("</ul>")
                ul = False
            continue
        # **표는 표로**(지시: 목업처럼). 파이프 표를 글줄로 흘리면 메일에서
        # 「| 구분 | 전체 |」 가 그대로 보인다 — 숫자를 견주라고 만든 표인데
        # 자릿수가 어긋나 아무것도 못 읽는다.
        if t.lstrip().startswith("|") and i < len(lines) and _re.match(
            r"^\s*\|[\s:|-]+\|\s*$", lines[i]
        ):
            if ul:
                out.append("</ul>")
                ul = False
            cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
            head = cells(t)
            i += 1  # 구분선
            body = []
            while i < len(lines) and lines[i].lstrip().startswith("|"):
                body.append(cells(lines[i]))
                i += 1
            _TB = "border-collapse:collapse;margin:10px 0;font-size:12px"
            _TH = ("padding:6px 10px;border:1px solid #d5dde2;background:#f4f6f8;"
                   "text-align:left;font-weight:700;white-space:nowrap")
            _TD = "padding:6px 10px;border:1px solid #e5eaee"
            out.append(f"<table style='{_TB}'>")
            out.append("<thead><tr>" + "".join(f"<th style='{_TH}'>{_ln(c)}</th>" for c in head) + "</tr></thead>")
            out.append("<tbody>")
            for r in body:
                out.append("<tr>" + "".join(f"<td style='{_TD}'>{_ln(c)}</td>" for c in r) + "</tr>")
            out.append("</tbody></table>")
            continue
        # 그림 한 줄 — ![구성도](/api/req-images/…)
        #
        # 이 길(마크다운)로 오면 그림 문법을 아무도 안 읽어 「![구성도](…)」 가
        # 글자 그대로 메일에 실렸다. 보고서에 구성도를 붙이면서 드러난 구멍이다.
        mi = _re.match(r"^!\[([^\]]*)\]\(([^)\s]+)\)\s*$", t.strip())
        if mi:
            if ul:
                out.append("</ul>")
                ul = False
            _alt = _h.escape(mi.group(1))
            _src = _h.escape(mi.group(2), quote=True)
            out.append(f'<img src="{_src}" alt="{_alt}" style="max-width:100%;height:auto">')
            continue
        m = _re.match(r"^(#{1,4})\s+(.*)$", t)
        if m:
            if ul:
                out.append("</ul>")
                ul = False
            lv = min(3, max(2, len(m.group(1))))
            _hs = {2: "16px 0 6px;font-size:15px", 3: "14px 0 5px;font-size:13px"}[lv]
            out.append(f"<h{lv} style='margin:{_hs};font-weight:700'>{_ln(m.group(2))}</h{lv}>")
            continue
        m = _re.match(r"^\s*[-*+]\s+(.*)$", t)
        if m:
            if not ul:
                out.append("<ul style='margin:6px 0;padding-left:20px'>")
                ul = True
            out.append(f"<li style='margin:2px 0'>{_ln(m.group(1))}</li>")
            continue
        if ul:
            out.append("</ul>")
            ul = False
        out.append(f"<p style='margin:6px 0'>{_ln(t)}</p>")
    if ul:
        out.append("</ul>")
    subject, _ = await _cycle_mail_html(cycle_id, "", "")
    return {"html": "\n".join(out), "subject": subject}


@router.post("/api/cycle/{cycle_id}/mail-preview")
async def cycle_mail_preview_post(cycle_id: str, payload: dict, token: str = ""):
    """미리보기 — **본문이 길어 주소에 못 싣는다.** GET 판은 note 한 줄용이라
    남겨 두고, Test Summary 처럼 긴 양식은 몸통으로 받는다."""
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    subject, html = await _cycle_mail_html(
        cycle_id,
        str(payload.get("note") or "").strip(),
        str(payload.get("body_html") or ""),
    )
    return {"subject": subject, "html": html}


@router.post("/api/cycle/{cycle_id}/mail")
async def cycle_mail(cycle_id: str, payload: dict, token: str = ""):
    if not core.user_from_token(token):
        raise HTTPException(401, "로그인이 필요합니다")
    to = payload.get("to") or ""
    if not str(to).strip():
        raise HTTPException(400, "받는 사람을 적어 주세요")
    # **빈 메일은 막는다.** 메일 몸통은 이제 내용 칸 글이 전부다(지시) —
    # 서버가 표를 덧붙이던 때는 비어도 뭔가 나갔지만, 지금은 진짜로 빈
    # 메일이 날아간다.
    if not str(payload.get("body_html") or "").strip() and not str(payload.get("note") or "").strip():
        raise HTTPException(400, "내용을 적어 주세요 — 메일은 내용 칸에 있는 글로 나갑니다")
    if not core.load_mail_cfg().get("enabled"):
        raise HTTPException(400, "메일 발송이 꺼져 있습니다 (시스템 → 메일 설정)")
    subject, html = await _cycle_mail_html(
        cycle_id,
        str(payload.get("note") or "").strip(),
        str(payload.get("body_html") or ""),
    )
    subject = str(payload.get("subject") or "").strip() or subject
    # **이름만 남긴다**(지적: 보낸이에 {'id': 'admin', …} 이 그대로 보인다).
    # _user_from_token 은 계정 **객체**를 돌려준다 — 그것을 str() 로 굳혀
    # 넣고 있었다. 계정 기록을 통째로 담을 까닭도 없다.
    _wu = core.user_from_token(token) or {}
    who = str(_wu.get("name") or _wu.get("username") or "") if isinstance(_wu, dict) else str(_wu)
    note = str(payload.get("note") or "").strip()
    cc = core.addr_list(payload.get("cc"))
    bcc = core.addr_list(payload.get("bcc"))
    files = [f for f in (payload.get("files") or []) if isinstance(f, dict)]
    # 첨부는 **전체 25MB** 까지(창에서도 같은 자로 막는다). 넘기면 SMTP 가
    # 거절하거나, 받는 쪽 메일함이 통째로 물린다.
    tot = 0
    for f in files:
        tot += int(f.get("size") or 0)
    if tot > 25 * 1024 * 1024:
        raise HTTPException(400, "첨부가 전체 25MB를 넘습니다")
    # 이력에 남길 첨부 — **이름과 크기만**. 파일을 DB 에 담지 않는다.
    att = [{"name": str(f.get("filename") or ""), "size": int(f.get("size") or 0)} for f in files]
    joined = ", ".join(core.addr_list(to))
    ccj, bccj = ", ".join(cc), ", ".join(bcc)
    try:
        sent = core.send_mail(to, subject, html, html=True, cc=cc, bcc=bcc, files=files)
    except Exception as e:
        # **실패도 남긴다** — 다시 보낼지 판단하려면 시도한 자취가 있어야 한다
        try:
            await db.cycle_mail_add(cycle_id, str(who), joined, subject, note, False, str(e),
                                    cc_list=ccj, bcc_list=bccj, body_html=html, att=att)
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(400, f"보내지 못했습니다 — {e}")
    try:
        await db.cycle_mail_add(cycle_id, str(who), ", ".join(sent or core.addr_list(to)),
                                subject, note, True, "",
                                cc_list=ccj, bcc_list=bccj, body_html=html, att=att)
    except Exception:  # noqa: BLE001
        pass  # 기록이 실패해도 메일은 이미 나갔다
    return {"success": True, "to": sent, "cc": cc, "bcc": bcc, "subject": subject}


@router.post("/api/cycle/{cycle_id}/picked")
async def cycle_picked_save(cycle_id: str, payload: dict):
    """골라 둔 시험 항목을 사이클에 굳힌다(지시: 계정 말고 서버에).

    체크는 「이번에 이것만 돌린다」 는 시험 계획이라 누가 열어도 같아야
    한다. 문서 전체를 다시 쓰지 않고 이 칸 하나만 바꾼다 — items 가 수 MB
    라 체크 한 번에 통째로 밀면 표가 버벅인다."""
    picked = (payload or {}).get("picked")
    if not isinstance(picked, list):
        raise HTTPException(400, "picked 는 배열이어야 합니다")
    if not await db.cycle_set_picked(cycle_id, picked):
        raise HTTPException(404, "사이클을 찾을 수 없습니다")
    return {"ok": True, "picked": len(picked)}


@router.post("/api/cycle/{cycle_id}/test-cond")
async def cycle_cond_save(cycle_id: str, payload: dict):
    """시험 조건을 사이클에 굳힌다 — 반복 횟수·간격·실패 처리·합격 기준.

    화면 상태로 두면 새로고침 한 번에 1 회로 돌아간다(지적). 사이클마다
    조건이 다르니 사이클이 들고 있어야 하고, 누가 열어도 같아야 한다."""
    cond = (payload or {}).get("cond")
    if cond is not None and not isinstance(cond, dict):
        raise HTTPException(400, "cond 는 객체여야 합니다")
    if not await db.cycle_set_cond(cycle_id, cond):
        raise HTTPException(404, "사이클을 찾을 수 없습니다")
    return {"ok": True}


@router.get("/api/cycle/{cycle_id}/mail-log")
async def cycle_mail_log(cycle_id: str, limit: int = 50):
    """결과서를 누구에게 언제 보냈나 — Test Summary 탭이 읽는다."""
    return {"items": await db.cycle_mail_list(cycle_id, limit)}


# 버전그룹 폴더 — `{ "<모델명>": ["R200", "R300"] }`
#
# 모델그룹·모델명은 장비 카탈로그가 master 다. 자유 입력으로 두었더니
# `E4320-24P_2` 같은 것이 생겼다. 버전그룹만 사람이 만든다 — R200, R300
# 은 카탈로그가 알 수 없는, 이 회차 묶음의 이름이라서다.
#
# **파일이 아니라 DB 에 둔다.** 옛 플랜 폴더는
# `data/state/cycle_folders.json` 이었고, 자료를 옮길 때 딸려오지 않아
# 플랜 23건이 전부 이름 없는 폴더를 가리키게 됐다.
_VGROUP_KV = "cycle_version_groups"


@router.get("/api/cycle-version-groups")
async def get_cycle_version_groups():
    return {"groups": await db.kv_get(_VGROUP_KV) or {}}


@router.post("/api/cycle-version-groups")
async def save_cycle_version_groups(payload: dict):
    groups = payload.get("groups")
    if not isinstance(groups, dict):
        raise HTTPException(400, "groups 는 { 모델명: [버전그룹…] } 이어야 합니다")
    clean = {}
    for model, arr in groups.items():
        m = str(model).strip()
        if not m or not isinstance(arr, list):
            continue
        seen = []
        for g in arr:
            g = str(g).strip()
            if g and g not in seen:
                seen.append(g)
        clean[m] = seen
    await db.kv_set(_VGROUP_KV, clean)
    return {"ok": True, "groups": clean}


@router.post("/api/cycle-version-groups/add")
async def add_cycle_version_group(payload: dict):
    """버전그룹 한 칸을 **더한다**.

    위의 통째 저장(POST)은 받은 사전으로 갈아끼운다 — 두 사람이 같은 때에
    각자 폴더를 만들면 나중 것이 앞 것을 통째로 지운다. 화면이 제 손에 든
    낡은 사전을 되쓰기 때문이다. 여기서는 **서버가 읽어서 더한다.**
    """
    model = str(payload.get("model") or "").strip()
    group = str(payload.get("group") or "").strip()
    if not model or not group:
        raise HTTPException(400, "모델과 버전그룹 이름이 필요합니다")
    if "/" in group:
        raise HTTPException(400, "버전그룹 이름에 / 는 쓸 수 없습니다")
    cur = await db.kv_get(_VGROUP_KV) or {}
    arr = [str(g) for g in (cur.get(model) or [])]
    if group in arr:
        raise HTTPException(409, f"「{group}」 은 이미 있습니다")
    arr.append(group)
    cur[model] = arr
    await db.kv_set(_VGROUP_KV, cur)
    return {"ok": True, "groups": cur}


@router.delete("/api/cycle-version-groups/{model}/{group}")
async def del_cycle_version_group(model: str, group: str, force: int = 0):
    """버전그룹 폴더를 지운다.

    **트리의 버전그룹 마디는 두 종류다.**

      ① KV(`cycle_version_groups`)에 사람이 등록한 것
      ② 플랜·실행의 `version_group` 값에서 **파생된** 것 — 저장된 실체가 없다

    ②는 지울 껍데기가 없다. 그 이름을 트리에서 없애려면 안의 플랜·실행을
    옮기거나 지워야 한다. 전에는 이 경우에 「없는 버전그룹입니다」(404)
    라고만 해서, 사람은 왜 안 지워지는지 알 수가 없었다(지적).

    그래서 **내용물부터 센다.** 무엇이 걸려 있는지 말한 다음에 지운다.
    """
    cur = await db.kv_get(_VGROUP_KV) or {}
    arr = [str(g) for g in (cur.get(model) or [])]
    in_kv = group in arr

    # ── 이 폴더에 걸린 플랜과 실행
    plans = [
        c for c in await db.cycle_list_meta()
        if str(c.get("model") or "") == model and str(c.get("version_group") or "") == group
    ]
    all_plans = {str(c.get("id") or ""): c for c in await db.cycle_list_meta()}
    runs = []
    for r in await db.plan_run_list():
        if str(r.get("version_group") or "") != group:
            continue
        p = all_plans.get(str(r.get("plan_id") or ""))
        # 플랜이 모델의 정본. 플랜 없는 실행은 제 메타에 모델을 들고 다닌다
        meta = r.get("meta")
        meta = meta if isinstance(meta, dict) else {}
        m = str((p or {}).get("model") or meta.get("model") or "")
        if m == model:
            runs.append(r)

    if (plans or runs) and not force:
        what = " · ".join(
            x for x in (
                f"사이클 {len(plans)}건" if plans else "",
                f"시험 실행 {len(runs)}건" if runs else "",
            ) if x
        )
        raise HTTPException(409, f"이 폴더에 {what}이 있습니다 — 옮기거나 지운 뒤 다시 하세요")

    if not in_kv:
        # 파생 마디다. KV 에서 뺄 것이 없으니 force 여도 트리에서 안 사라진다.
        if plans or runs:
            raise HTTPException(
                400,
                "이 폴더는 사이클·실행이 만든 이름이라 따로 지울 것이 없습니다 — "
                "안의 사이클·실행을 지우거나 다른 버전그룹으로 옮기세요",
            )
        raise HTTPException(404, "없는 버전그룹입니다")

    rest = [g for g in arr if g != group]
    if rest:
        cur[model] = rest
    else:
        cur.pop(model, None)
    await db.kv_set(_VGROUP_KV, cur)
    # kept = 이름은 뺐지만 플랜·실행이 남아 트리에는 계속 보인다
    return {
        "ok": True,
        "groups": cur,
        "plans": len(plans),
        "runs": len(runs),
        "kept": bool(plans or runs),
    }


CYCLE_FOLDERS_FILE = core.DATA_DIR / "state" / "cycle_folders.json"

@router.get("/api/cycle-folders")
async def get_cycle_folders():
    if not CYCLE_FOLDERS_FILE.exists():
        return {"folders": []}
    return core.load_json(CYCLE_FOLDERS_FILE)

@router.post("/api/cycle-folders")
async def save_cycle_folders(data: dict):
    core.save_json(CYCLE_FOLDERS_FILE, data)
    return {"success": True}


def _strip_derived(d: dict) -> dict:
    """내보낼 때 붙인 파생 키(_created_at 등)를 걷는다 — 원본에 없던 것이다."""
    return {k: v for k, v in d.items() if not str(k).startswith("_")}


@router.get("/api/tc-running")
async def tc_running_now():
    """지금 자동 실행 중인 시험들 — 방금 접속한 사람이 현황을 받는다.
    브로드캐스트는 이미 붙어 있는 사람에게만 가므로, 이 GET 이 초기값이다."""
    return {"items": {k: v for k, v in core.tc_running.items()}}


@router.get("/api/cycle/{cycle_id}")
async def get_cycle(cycle_id: str):
    d = await db.cycle_get(cycle_id)
    if d is None:
        raise HTTPException(404, "Cycle을 찾을 수 없습니다")
    return d

@router.get("/api/pptx-templates")
def pptx_templates():
    """고를 수 있는 고객사 양식. 파일이 없는 것은 빼고 준다."""
    import pptx_tpl
    return {"templates": pptx_tpl.list_templates()}


@router.post("/api/pptx-render")
async def pptx_render(payload: dict):
    """
    고객사 양식에 값을 채워 결과서를 만든다.

    **내용은 화면이 조립해서 보낸다.** 미리보기가 쓰는 것과 같은 자료·같은
    쪽 나누기를 그대로 쓰기 위해서다 — 서버에서 따로 조립하면 두 벌이 되고,
    한쪽만 고치는 순간 화면에서 본 장수와 파일의 장수가 어긋난다.

    서버가 하는 일은 하나다: 고객사가 준 pptx 를 열어 **그 안의 장을 복제해
    값만 갈아 끼운다.** 글꼴·표선·색·머리글은 손대지 않으므로 받는 쪽 눈에는
    자기네 양식 그대로다.
    """
    import pptx_tpl
    from pptx import Presentation

    tid = str((payload or {}).get("template") or "lguplus")
    tpl = pptx_tpl.TEMPLATES.get(tid)
    if not tpl:
        raise HTTPException(400, f"모르는 양식입니다: {tid}")
    path = pptx_tpl.TPL_DIR / str(tpl["file"])
    if not path.exists():
        raise HTTPException(404, f"양식 파일이 없습니다: {path.name}")

    slides = (payload or {}).get("slides") or []
    if not slides:
        raise HTTPException(400, "채울 내용이 없습니다")

    prs = Presentation(str(path))
    src_first = prs.slides[int(tpl["first"])]
    src_more = prs.slides[int(tpl["more"])]
    n_tpl = len(list(prs.slides))

    for sl in slides:
        kind = str((sl or {}).get("kind") or "first")
        vals = {k: str(v if v is not None else "") for k, v in ((sl or {}).get("values") or {}).items()}
        if kind == "more":
            new = pptx_tpl.clone_slide(prs, src_more)
            pptx_tpl.fill(new, tpl["more_spots"], vals)
        else:
            new = pptx_tpl.clone_slide(prs, src_first)
            pptx_tpl.fill(new, tpl["spots"], vals)
        # 양식에 얹혀 있던 **예시 그림·글상자**를 걷는다. 안 걷으면 만든
        # 결과서 모든 쪽에 남의 시험 화면이 실려 진짜 결과를 덮는다.
        pptx_tpl.strip_samples(new)
        # 그 위에 이 시험의 그림을 얹는다 — 구성도, 그리고 CLI 캡쳐
        pics = tpl.get("more_pics" if kind == "more" else "pics") or {}
        for name, spec in pics.items():
            blob = pptx_tpl.decode_img(str((sl or {}).get(name) or ""))
            if not blob:
                continue
            try:
                rect = pptx_tpl.pic_rect(new, spec)
                if rect:
                    pptx_tpl.place_pic(new, blob, rect)
            except Exception:
                # 그림 하나 때문에 결과서 전체가 안 나오면 안 된다
                pass

    # 본보기 장은 결과에 남기지 않는다. 뒤에서부터 빼야 번호가 안 밀린다.
    for i in range(n_tpl - 1, -1, -1):
        pptx_tpl.drop_slide(prs, i)

    import io
    from fastapi.responses import StreamingResponse
    buf = io.BytesIO()
    prs.save(buf)
    buf.seek(0)
    name = pptx_tpl.safe(str((payload or {}).get("name") or "결과서")) + ".pptx"
    from urllib.parse import quote
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(name)}"},
    )


async def _model_group_of(data: dict) -> str:
    """이 사이클의 **모델그룹** — 적혀 있으면 그대로, 없으면 모델로 찾는다.

    cid 앞머리(E61xx-C0001)와 결함 ID(E6100-E61xx-001)가 **같은 자**를 써야
    한다. 한쪽만 다른 길로 구하면 같은 사이클인데 ID 계열이 갈린다.
    """
    mg = str((data or {}).get("model_group") or "").strip()
    if mg:
        return mg
    model = str((data or {}).get("model") or "").strip()
    if not model:
        return ""
    try:
        for it in await db.catalog_list():
            if str(it.get("kind")) == "model" and str(it.get("name")) == model:
                return str(it.get("model_group") or "").strip()
    except Exception:
        pass
    return ""


async def _cycle_cid_prefix(data: dict) -> tuple[str, int]:
    """cid 앞머리 — **모델그룹 기준**(E61xx-C0001), 요구사항·시험과 같은 규칙.

    모델그룹을 모르면(제목만 치고 만든 인라인 생성) 옛 주차 규칙으로
    떨어진다 — 앞머리를 지어내지 않는다. 나중에 모델그룹을 채우면
    ID 옮기기(SETUP)가 새 규칙으로 따라온다."""
    mg = await _model_group_of(data)
    if mg:
        # 이음쇠는 **하이픈**이다. ID 옮기기(SETUP)가 요구사항·시험·플랜을
        # E61xx-R0001 · E61xx-T0001 · E61xx-C0001 로 바꿨는데 여기만 밑줄로
        # 남아 있었다 — 그 탓에 아래 startswith 검사가 늘 어긋나, 결과가
        # 없는 플랜을 **저장할 때마다 부여 ID 가 새로 매겨졌다**(실사고:
        # E61xx-P0001 이 사업자 한 칸 고쳤다고 E61xx_P0003 이 됐다).
        #
        # 글머리는 **C**(Cycle)다. P(플랜)이던 것을 바꿨다(지시) — 메뉴가
        # Cycles 인데 ID 만 P 면 서로 다른 말을 한다. 결과가 쌓인 옛
        # P 사이클은 그대로 두고(아래 save_cycle 의 「결과 없으면 재부여」
        # 규칙이 빈 것만 새 글머리로 옮긴다), 번호는 C 안에서 새로 센다.
        return f"{mg}-C", 4
    from datetime import datetime as _dt
    return db._cid_prefix_of(_dt.now()), 3


# ══════════════════════════════════════════════════════════════════════
# 시험 실행(plan_run) — 플랜 1 : 실행 N
#
# 플랜은 「무엇을 시험할지」, 실행은 「어느 빌드에 어느 장비로 돌렸는지」.
# 만들 때 플랜의 항목을 **복사**해 담는다 — 뒤에 플랜을 고쳐도 이미 뜬
# 실행은 안 바뀌어야 결과서 숫자가 나중에 흔들리지 않는다.
# ══════════════════════════════════════════════════════════════════════
@router.get("/api/plan-runs")
async def api_plan_runs(plan_id: str = "", closed: str = "1"):
    return {"runs": await db.plan_run_list(plan_id, with_closed=closed != "0")}


@router.get("/api/plan-runs-regression")
async def api_plan_run_regression(plan_id: str, a: str = "", b: str = ""):
    """빌드 간 회귀 — 두 빌드에서 같은 항목의 결과가 어떻게 달라졌나.

    한 빌드에서 항목의 대표 상태는 **한 번이라도 실패면 실패**다. 같은
    빌드로 여러 실행을 뜰 수 있어서(장비를 바꿔 가며) 그중 하나만 깨져도
    그 빌드는 깨진 것이다.

    결과를 화면으로 다 보내면 수 MB 라, 여기서 접어 **바뀐 것만** 준다."""
    runs = await db.plan_run_list(plan_id)
    versions = []
    for r in runs:
        v = str(r.get("version") or "")
        if v and v not in versions:
            versions.append(v)
    versions.sort(reverse=True)
    if len(versions) < 2:
        return {"versions": versions, "a": "", "b": "", "changed": [], "same": 0}

    B = b if b in versions else versions[0]
    A = a if (a in versions and a != B) else next(v for v in versions if v != B)

    groups = await db.verdict_groups()

    def _grp(v: str) -> str:
        vv = db._LETTER_VERD.get(str(v), str(v))
        return "none" if not vv else groups.get(vv, "neutral")

    async def status_map(ver: str) -> dict:
        out = {}
        rank = {"fail": 3, "neutral": 2, "none": 1, "pass": 0}
        for r in runs:
            if str(r.get("version") or "") != ver:
                continue
            full = await db.plan_run_get(r["id"])
            for k, v in (full or {}).get("results", {}).items():
                if rank.get(_grp(v), 0) >= rank.get(_grp(out.get(k, "p")), 0):
                    out[k] = v
        return out

    ma, mb = await status_map(A), await status_map(B)
    changed, same = [], 0
    bad = ("fail", "neutral")
    for k in set(ma) | set(mb):
        x, y = ma.get(k), mb.get(k)
        if y is None:
            continue
        gx = _grp(x) if x is not None else None
        gy = _grp(y)
        if gy == "none":
            kind = "gone"
        elif gx == "pass" and gy in bad:
            kind = "broke"
        elif gx in bad and gy == "pass":
            kind = "fixed"
        elif gx in bad and gy in bad:
            kind = "still"
        else:
            same += 1
            continue
        changed.append({"tcid": k, "a": x, "b": y, "kind": kind})
    changed.sort(key=lambda r: (["broke", "still", "gone", "fixed"].index(r["kind"]), r["tcid"]))
    return {"versions": versions, "a": A, "b": B, "changed": changed, "same": same}


@router.get("/api/plan-runs/{run_id}")
async def api_plan_run_get(run_id: str):
    r = await db.plan_run_get(run_id)
    if not r:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    return r


_MANUAL_WORDS = {"수동", "M", "MANUAL", "MAN", "HAND", "사람"}


def _is_manual(v) -> bool:
    """이 값이 「수동」 을 뜻하나.

    이 값은 SETUP 의 코드(tc_run_type)에서 오고 **사람이 이름을 바꿀 수
    있다.** 253 은 「M」·「A」 로 쓴다. 글자를 그대로 견주면(== "수동") 그
    서버에서는 수동 시험이 전부 자동으로 굳어, 실행기가 사람 손이 필요한
    항목까지 그냥 돌린다.

    화면 쪽 규칙(web/src/lib/runMode.ts 의 normMode)과 **같은 말**을 안다 —
    두 쪽이 다르게 읽으면 목록과 실행이 어긋난다."""
    return str(v or "").strip().upper() in _MANUAL_WORDS


def _run_meta(p: dict, plan, model: str, mgroup: str) -> dict:
    """실행이 들고 다닐 메타. 만들기 창에서 고른 모델을 잃지 않는다.

    ★ 이 함수는 **라우트 데코레이터 아래에 두면 안 된다.** 한 번 그렇게
      넣었다가 실행 만들기 라우트가 이것에 붙어(FastAPI 는 바로 아래 함수를
      잡는다), 만들기가 통째로 422 로 막혔다 — query 로 plan·model 을
      내놓으라고 했다. 실사고: 213 배포 직후 실행 만들기 불가.
    """
    meta = dict(p.get("meta") or {})
    if model:
        meta.setdefault("model", model)
    if mgroup:
        meta.setdefault("model_group", mgroup)
    if not meta and not plan:
        meta = {"model": model}
    return meta


@router.post("/api/plan-runs")
async def api_plan_run_new(payload: dict):
    """실행 만들기. 플랜을 주면 그 항목을 떠 담는다(복사)."""
    p = payload or {}
    plan_id = str(p.get("plan_id") or "").strip()
    plan = await db.cycle_get(plan_id) if plan_id else None
    if plan_id and not plan:
        raise HTTPException(404, "플랜을 찾을 수 없습니다")

    # Key 앞머리 — 모델명이 정본이고, 비면 모델그룹으로 떨어진다.
    # 둘 다 비어야 RUN 이다(그 플랜은 아직 장비를 안 정한 것이다).
    model = str(p.get("model") or (plan or {}).get("model") or "").strip()
    mgroup = str(p.get("model_group") or (plan or {}).get("model_group") or "").strip()
    pre = model or mgroup
    rid = await db.plan_run_next_key(pre or "RUN")

    # 항목 복사 — 플랜의 items 를 결과칸이 빈 채로 떠 온다.
    #
    # 차례는 **배열로** 따로 남긴다. results 는 JSONB 객체라 PostgreSQL 이
    # 키를 정렬해 버려(넣은 차례가 아니다) 담은 차례를 알 수 없다. 실행기는
    # 위에서 아래로 도는데 화면만 뒤섞이면 「순서대로 안 도는 것 같다」 가
    # 된다(지적).
    results = dict(p.get("results") or {})
    order = [dict(x) for x in (p.get("items") or []) if isinstance(x, dict)]
    if plan and not results:
        for it in (plan.get("items") or []):
            k = str((it or {}).get("tcid") or "").strip()
            if k:
                results[k] = ""
    if plan and not order:
        for it in (plan.get("items") or []):
            k = str((it or {}).get("tcid") or "").strip()
            if k and k in results:
                order.append({"tcid": k})

    # 방식(자동·수동)은 **만들 때 굳힌다.** 플랜이 나중에 바뀌어도 이미 돈
    # 실행의 성격이 따라 바뀌면 안 된다 — 항목을 복사해 오는 것과 같은 뜻이다.
    # 플랜에 손으로 정한 값이 먼저고, 없으면 담긴 항목에서 뽑는다.
    mode = str(p.get("mode") or (plan or {}).get("mode") or "").strip()
    if not mode and plan:
        keys = [str((it or {}).get("tcid") or "").strip() for it in (plan.get("items") or [])]
        keys = [k for k in keys if k]
        if keys:
            async with db.pool().acquire() as _c:
                rows = await _c.fetch(
                    "SELECT tcid, coalesce(nullif(kind,''), data->>'run_type', '자동') AS k"
                    " FROM tc WHERE tcid = ANY($1::text[])",
                    keys,
                )
            kind = {r["tcid"]: str(r["k"] or "자동") for r in rows}
            n_man = sum(1 for k in keys if _is_manual(kind.get(k)))
            n_auto = len(keys) - n_man
            # 섞여 있으면 비운다 — 한쪽으로 우기면 반대쪽 화면이 안 열린다
            mode = "수동" if (n_man and not n_auto) else ("자동" if (n_auto and not n_man) else "")

    item = {
        "id": rid,
        "mode": mode,
        # 담은 차례 — 실행기가 도는 차례이자 화면이 그리는 차례다
        "items": order,
        "plan_id": plan_id or None,
        "name": str(p.get("name") or "").strip() or rid,
        "version": str(p.get("version") or (plan or {}).get("version") or ""),
        # 버전그룹은 **받은 값이 먼저**다. 안 주면 버전 이름의 첫 마디로
        # 떨어진다(db.plan_run_upsert). 만들 때 손으로 골랐는데 이름에서
        # 다시 뽑아 버리면 왼쪽 레일의 폴더가 고른 것과 달라진다.
        "version_group": str(p.get("version_group") or "").strip(),
        # 담당은 **보냈으면 보낸 대로**다. 빈 문자열도 뜻이 있다 —
        # 만들기 창의 「(안 정함)」 이 그것이다. or 로 이어 두었더니 빈 값이
        # 플랜의 담당으로 굴러떨어져, 안 정하겠다고 고른 사람에게 엉뚱한
        # 이름이 붙었다. 안 보낸 때(▶ 실행의 자동 만들기)만 플랜을 따른다.
        "owner": (
            str(p.get("owner") or "").strip()
            if "owner" in p
            else str((plan or {}).get("assignee") or "")
        ),
        "start_date": str(p.get("start_date") or ""),
        "end_date": str(p.get("end_date") or ""),
        "rerun_of": str(p.get("rerun_of") or "") or None,
        "created_by": core.who(),
        "results": results,
        "binds": dict(p.get("binds") or {}),
        # 플랜 없는 실행은 제 메타를 들고 있어야 목록에 설 수 있다.
        # 만들 때 모델을 손으로 골랐으면 플랜이 있어도 그것을 적어 둔다 —
        # 플랜의 모델과 다른 장비로 도는 실행이 있다(같은 플랜, 다른 모델).
        "meta": _run_meta(p, plan, model, mgroup),
    }
    await db.plan_run_upsert(rid, item)
    return {"id": rid, "run": await db.plan_run_get(rid)}


@router.post("/api/plan-runs/{run_id}")
async def api_plan_run_save(run_id: str, payload: dict):
    cur = await db.plan_run_get(run_id)
    if not cur:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    merged = {**cur, **(payload or {}), "id": run_id}
    await db.plan_run_upsert(run_id, merged)
    return {"success": True}


@router.delete("/api/plan-runs/{run_id}")
async def api_plan_run_delete(run_id: str):
    if not await db.plan_run_delete(run_id):
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    return {"success": True}


# ── 회차가 남긴 결과 ────────────────────────────────────────────────
#
# 여태 결과는 사이클 문서에 덮어써서, 다시 돌리면 지난 회차가 사라졌다.
# 이 넷이 회차를 따로 남기고 따로 꺼낸다. 목록은 **장비 출력을 안 싣는다** —
# 10,000 줄을 그려도 수백 KB 이고, 전문은 한 줄을 펼칠 때만 꺼낸다.


@router.get("/api/plan-runs/{run_id}/items")
async def api_plan_run_items(run_id: str, tcid: str = "", bad: str = "0",
                             limit: int = 300, offset: int = 0, since: str = ""):
    """Report 가 그리는 그 차례(끝난 것부터)로 회차 줄을 준다.
    since(이번 시작 시각)를 주면 그 뒤 회차만, seq 는 그 안에서 1 부터."""
    return await db.plan_run_item_list(run_id, tcid, bad == "1", limit, offset, since)


@router.get("/api/plan-runs/{run_id}/item")
async def api_plan_run_item_get(run_id: str, tcid: str, round: int = 1, since: str = ""):
    """한 줄의 전문. 접힌 회차면 대표 회차의 것을 대신 준다.
    since 를 주면 round 는 이번 시작분 안의 번호다."""
    r = await db.plan_run_item_get(run_id, tcid, round, since)
    if not r:
        raise HTTPException(404, "그 회차를 찾을 수 없습니다")
    return r


@router.get("/api/plan-runs/{run_id}/rounds")
async def api_plan_run_rounds(run_id: str, buckets: int = 0, tcid: str = "", since: str = ""):
    """회차 띠가 읽는 요약 — 회차마다 몇 건 돌고 몇 건 깨졌나.

    buckets 를 주면 그 칸 수로 접어 준다(10,000 회차 → 100 칸). 회차가
    그보다 적으면 접지 않는다. since 를 주면 이번 시작분만, 번호는 1 부터."""
    return await db.plan_run_rounds(run_id, max(0, min(400, buckets)), tcid, since)


@router.get("/api/plan-runs/{run_id}/stat")
async def api_plan_run_stat(run_id: str, tcid: str = "", by: str = "", since: str = ""):
    """몇 번 돌았고 몇 번 깨졌나 — 목록을 안 끌고 셈만 한다.

    `by=tcid` 면 **항목별로 한 방에** 센다 — 사이클 표의 「실패 이력」 이
    이것을 읽는다. 항목마다 따로 물으면 조회가 항목 수만큼 늘어난다.
    `by=day` 면 **날짜별·항목별** — 요약의 일자별 실행 횟수 그림이 읽는다."""
    if by == "tcid":
        return {"items": await db.plan_run_item_stat_by_tc(run_id)}
    if by == "day":
        # 날짜(한국 시각)별·항목별 — 요약의 일자별 실행 횟수 그림이 읽는다
        return {"days": await db.plan_run_item_stat_by_day(run_id)}
    return await db.plan_run_item_stat(run_id, tcid, since)


_JIRA_OPT_CACHE: dict = {}          # (프로젝트, 이슈유형) → {필드: {id: 이름}}
_JIRA_PRJ_NAMES: dict = {}          # 프로젝트 키 → 이름


async def _jira_load_project_names() -> None:
    """Jira 프로젝트 키 → 이름. 한 번 받아 두고 다시 쓴다(245 개다)."""
    if _JIRA_PRJ_NAMES:
        return
    r, err = jira._jira_call("GET", "/rest/api/2/project")
    if err or not r.is_success:
        return
    for p in r.json() or []:
        _JIRA_PRJ_NAMES[str(p.get("key") or "")] = str(p.get("name") or "")


async def _jira_defect_defaults(cycle: dict) -> dict:
    """**SETUP 의 Jira 프로젝트 패널 설정**에서 이 결함의 기본값을 뽑는다(지시).

    사람이 결함 창을 열어 하나씩 고르던 값들(프로젝트·이슈유형·우선순위·
    구성요소)을, 자동 등록에서는 설정이 대신 정한다. 어느 프로젝트인지는
    **사이클이 앉은 프로젝트**가 먼저고(project.jira_project), 없으면 설정의
    기본 프로젝트다.

    패널 설정은 값을 **Jira 내부 ID** 로 들고 있다(우선순위 '10100'). 표에는
    이름이 서야 하므로 createmeta 로 한 번 받아 옮겨 적고, 그 뒤로는 담아
    둔 것을 쓴다 — 결함 하나 만들 때마다 Jira 를 부르면 시험이 느려진다.

    Jira 가 안 붙어 있어도 **결함은 만들어져야 한다** — 못 읽은 칸은 빈 채로
    둔다.
    """
    cfg = jira._jira_cfg()
    mg = str(cycle.get("model_group") or "")
    md = str(cycle.get("model") or "")
    key = ""
    # ① 사람이 맺어 둔 연결이 먼저다(SETUP ▸ 프로젝트의 jira_project)
    try:
        async with db.pool().acquire() as c:
            r = await c.fetchrow(
                "SELECT jira_project FROM project "
                " WHERE model_group = $1 AND ($2 = '' OR COALESCE(model,'') = $2) "
                " ORDER BY (COALESCE(model,'') = $2) DESC LIMIT 1",
                mg, md,
            )
        key = str((r or {}).get("jira_project") or "").strip()
    except Exception:
        pass
    # ② 없으면 **이름이 제품인 Jira 프로젝트**를 찾는다 — 이 팀은 Jira
    #    프로젝트 이름을 제품명으로 둔다(E6100 = P88, E6400 = P278).
    if not key:
        try:
            await _jira_load_project_names()
            for k, nm in _JIRA_PRJ_NAMES.items():
                if md and nm == md:
                    key = k
                    break
            if not key and mg:
                key = next((k for k, nm in _JIRA_PRJ_NAMES.items() if nm == mg), "")
        except Exception:
            pass
    # ③ 그래도 못 찾으면 **비운다**. 설정의 기본 프로젝트로 떨어뜨리면
    #    E6100 시험의 결함이 엉뚱한 제품(U9532H)에 붙는다(지적) —
    #    빈칸이 틀린 값보다 낫다. 사람이 결함 창에서 고르면 된다.
    if not key:
        return {}
    tmpl = ((cfg.get("panel_templates") or {}).get(key) or {}).get("defect") or {}
    itype = str(tmpl.get("issuetype") or cfg.get("default_issuetype") or "")
    fd = tmpl.get("field_defaults") or {}
    out = {"jira_project": key, "issue_type": itype}
    try:
        await _jira_load_project_names()
        out["project_name"] = _JIRA_PRJ_NAMES.get(key, "")
    except Exception:
        pass
    # 우선순위·구성요소 — ID 를 이름으로
    try:
        ck = (key, itype)
        if ck not in _JIRA_OPT_CACHE:
            names: dict = {}
            r, err = jira._jira_call(
                "GET",
                f"/rest/api/2/issue/createmeta?projectKeys={key}&expand=projects.issuetypes.fields",
            )
            if not err and r.is_success:
                for pr in (r.json().get("projects") or [])[:1]:
                    for it in pr.get("issuetypes", []):
                        if itype and str(it.get("id")) != itype and it.get("name") != itype:
                            continue
                        for fid, f in (it.get("fields") or {}).items():
                            av = f.get("allowedValues")
                            if isinstance(av, list):
                                names[fid] = {
                                    str(o.get("id") or ""): str(o.get("name") or o.get("value") or "")
                                    for o in av
                                }
                        break
            _JIRA_OPT_CACHE[ck] = names
        names = _JIRA_OPT_CACHE.get(ck) or {}
        pv = str(fd.get("priority") or "")
        if pv:
            out["priority"] = (names.get("priority") or {}).get(pv, "")
        cv = str(fd.get("components") or "")
        if cv:
            out["component"] = (names.get("components") or {}).get(cv, "")
    except Exception:
        pass
    return {k: v for k, v in out.items() if v}


_VAR_RE = __import__("re").compile(r"[\'\"]?\$\{[^}]*\}[\'\"]?")


def _re_sub_oid(t: str) -> str:
    """시험 이름에서 **OID 괄호를 걷는다** — 요약이 길어지는 주범이다.

    `sysDescr ( OID-1.3.6.1.2.1.1 ) Get 동작 확인` → `sysDescr Get 동작 확인`.
    OID 는 본문(시험내역)에 그대로 남으므로 요약에서는 덜어도 잃는 것이 없다.
    """
    import re as _re
    out = _re.sub(r"\(\s*OID-[^)]*\)", "", str(t or ""))
    return _re.sub(r"\s{2,}", " ", out).strip()


def _plain_ko(t: str) -> str:
    """**스크립트 표기를 걷어낸다**(지적: 변수가 그대로 들어가면 모른다).

    시험은 `${var1} == ${var2}` 처럼 제 변수로 적히지만, 결함을 읽는 사람은
    그 시험 스크립트를 모른다. 변수와 그 둘레의 따옴표·비교 기호를 걷어내면
    「비교 값이 동일 하지 않습니다」 같은 **사람 문장**만 남는다.

    걷어낸 뒤 남는 글이 없으면 빈 문자열을 돌려준다 — 부르는 쪽이 그때는
    다른 말(스텝 설명·시험 항목 이름)을 쓴다.
    """
    import re as _re
    t = _VAR_RE.sub("", str(t or ""))
    t = _re.sub(r"\s*(==|!=|>=|<=|=|>|<)\s*", " ", t)   # 남은 비교 기호
    t = _re.sub(r"\s{2,}", " ", t).strip(" \t·-—,.:;")
    return t


def _step_is_fail(st: dict) -> bool:
    """스텝 하나가 깨졌나 — 판정 글자가 없으면 회차 안을 본다.

    반복 시험은 스텝 최상위에 판정을 안 남기고 rounds[] 에만 남기는 일이
    있다. 겉만 보면 「깨진 스텝이 없다」 가 되어 결함 본문이 빈다."""
    v = str(st.get("status") or st.get("verdict") or "").strip().upper()
    if v:
        return v.startswith("F") or v in ("부적합", "실패", "불합격")
    rs = st.get("rounds")
    if isinstance(rs, list):
        for r in rs:
            if isinstance(r, dict) and str(r.get("status") or "").strip().upper().startswith("F"):
                return True
    return False


async def _auto_defect(run_id: str, tcid: str, body: dict, base_url: str = "",
                       cycle_id: str = "", who_in: str = "") -> None:
    """**시험이 깨지면 그 자리에서 결함을 만든다**(지시).

    사람이 「결함 만들기」 를 누르러 돌아오지 않아도 사이클 Defects 탭과
    Defects 화면에 바로 선다 — 둘은 같은 표(defect)를 읽으므로, 여기서
    한 번 만들면 두 곳에 함께 쌓인다.

    항목 하나에 결함 하나다(defect_by_item). 50 회를 돌려 50 번 깨져도
    결함은 하나고, 깨진 스텝 내용은 그 하나에 담긴다.

    **결과 저장을 막지 않는다** — 결함을 못 만들어도 실행 기록은 남아야
    하므로 모든 예외를 여기서 삼킨다.
    """
    # 자동 시험은 실행(plan_run)을 거쳐 오고, **수동 시험은 사이클을 바로
    # 저장한다**(지시: 수동에서 Fail 로 바꿔도 Defects 에 남아야 한다).
    # 그래서 사이클을 두 길로 찾는다 — 실행 번호로, 또는 사이클로 바로.
    run = await db.plan_run_get(run_id) if run_id else None
    cid = str(cycle_id or (run or {}).get("plan_id") or "").strip()
    if not cid:
        return
    if await db.defect_by_item(cid, tcid):
        return                                   # 이미 있다 — 항목 하나에 하나
    cyc = await db.cycle_get(cid) or {}
    name = ""
    for it in (cyc.get("items") or []):
        if isinstance(it, dict) and str(it.get("tcid") or "") == tcid:
            name = str(it.get("name") or it.get("title") or "")
            break
    model = str(cyc.get("model") or "")
    version = str(cyc.get("version") or (run or {}).get("version") or "")
    extra = await _jira_defect_defaults(cyc)
    # **보고자는 시험을 시작한 그 사람**이다(지시: 로그인한 계정).
    # 이 팀은 UTOP 로그인이 곧 Jira 계정이라(devums 연동) 계정 아이디를
    # 그대로 적으면 지라로 올릴 때 그 사람이 보고자가 된다
    # (fields.reporter = {"name": ...}).
    #
    # 일감(cycle_run)의 started_by 가 「시작 단추를 누른 사람」 이다 — 실행을
    # 만든 계정(plan_run.created_by)은 며칠 전 다른 사람일 수 있다. 다만
    # 일감에는 **표시 이름**(관리자)이 적히므로 계정 아이디로 옮긴다.
    # 수동 판정은 **고친 사람**이 곧 보고자다 — 실행이 없으니 물어볼 데도 없다
    who = str(who_in or "").strip()
    try:
        if not who and run_id:
            async with db.pool().acquire() as c:
                # **시간으로 고른다.** id 는 랜덤 hex 라 정렬해도 시간순이 아니다 —
                # 그 바람에 늘 엉뚱한(옛) 일감을 집어, 누가 돌리든 보고자가 처음
                # 돌린 사람으로 박혔다(지적: 계정과 상관없이 admin).
                # 지금 도는 일감이 있으면 그것이 먼저다.
                r2 = await c.fetchrow(
                    "SELECT started_by FROM cycle_run WHERE plan_run_id = $1 "
                    " AND COALESCE(started_by,'') <> '' "
                    " ORDER BY (status IN ('running','queued')) DESC, "
                    "          started_at DESC NULLS LAST, queued_at DESC NULLS LAST LIMIT 1",
                    run_id,
                )
            who = str((r2 or {}).get("started_by") or "").strip()
    except Exception:
        pass
    # **이름으로 적는다**(지시) — 화면에서 사람이 읽는 값이다. 계정 아이디는
    # 지라로 올릴 때 그 자리에서 옮긴다(_jira_user_name).
    who = who or core.user_name_of(str((run or {}).get("created_by") or cyc.get("created_by") or ""))
    if who:
        extra["reporter"] = who
    steps = [x for x in (body.get("steps") or []) if isinstance(x, dict)]
    # **절차는 통째로 담는다**(지시) — 깨진 것만 담으면 「무엇을 하다 거기서
    # 깨졌나」 를 알 수 없어 재현이 안 된다. 어디서 깨졌는지는 스텝마다 붙는
    # 판정이 말한다. 현상 칸은 여전히 깨진 스텝만 본다(그것이 증상이다).
    pick = steps
    briefs = [{
        "no": steps.index(x) + 1,
        "kind": str(x.get("kind") or "cli"),
        "desc": str(x.get("desc") or x.get("step") or ""),
        "cli": str(x.get("cli") or ""),
        "criteria": str(x.get("criteria") or ""),
        # 판정을 적는 이름이 길에 따라 다르다 — 실행기는 status·verdict,
        # 사이클 문서(수동)는 result 다(웹 stepVerdict 와 같은 차례).
        # **모르면 미실행**이다: 여기서 FAIL 로 메우면 사람이 손도 안 댄
        # 스텝이 「판정: FAIL」 로 이슈에 실린다.
        "status": str(x.get("result") or x.get("status") or x.get("verdict") or ""),
        "reason": str(x.get("reason") or ""),
        "output": str(x.get("output") or "")[:4000],
    } for x in pick[:40]]
    for _ in range(3):
        # ID 는 **모델그룹-DF0001**(지시). 자동 결함은 유형을 따로 안 받으니
        # 늘 DF 다 — CR 은 사람이 유형을 골라 만든다.
        did = await db.defect_next_id(await _model_group_of(cyc))
        try:
            # **현상**(지시) — 어떤 시험을 돌다 무엇이 어긋났는지 한 문단.
            # 사람이 결함을 열었을 때 첫 칸이 비어 있으면 그때부터 기억을
            # 더듬어야 한다. 깨진 스텝의 판정 근거가 곧 그 문장이다.
            # 「현상」 은 **증상 한 줄**이다(지시: "dwrr 비율이 맞지않는 현상,
            # Multicast 플러딩 불가" 같은 꼴). 깨진 스텝마다 「무엇이 안 된다」
            # 를 짧게 적고 쉼표로 잇는다 — 자세한 경위는 아래 판들이 맡는다.
            # **같은 시험을 두 번 적지 않는다.** 반복 시험은 회차마다 줄이
            # 서고 「반복 시험 실패」 같은 껍데기 스텝도 끼어, 그대로 이으면
            # 「반복 시험 실패, A 실패 — 까닭, A 실패」 가 된다(지적).
            #  · 실제로 무엇을 했는지 아는 스텝(명령·출력이 있는 것)을 앞에.
            #  · 같은 일을 가리키는 줄은 하나만 — 까닭이 붙은 쪽을 남긴다.
            fails = [b for b in briefs if str(b.get("status") or "").upper().startswith("F")]
            # 「반복 시험 실패」 처럼 **무엇을 했는지 없는 껍데기**는, 실제로
            # 명령을 친 스텝이 하나라도 있으면 쓰지 않는다 — 군더더기다.
            solid = [b for b in fails if (b.get("cli") or b.get("output"))]
            fails = solid or fails
            picked: dict[str, str] = {}
            order: list[str] = []
            for b in fails:
                what = str(b.get("desc") or "").strip() or _plain_ko(str(b.get("cli") or ""))
                why2 = _plain_ko(str(b.get("reason") or ""))
                if len(why2) > 60:
                    why2 = why2[:60].rstrip() + "…"
                key = _re_sub_oid(what) or why2
                if not key:
                    continue
                import re as _re2
                w2 = _re_sub_oid(what)
                # 이미 「… 실패/불가/오류/미동작」 으로 끝나면 또 붙이지 않는다
                tail = "" if _re2.search(r"(실패|불가|오류|미동작|안 ?됨|안 ?나옴)$", w2) else " 실패"
                line = f"{w2}{tail} — {why2}" if w2 and why2 else (f"{w2}{tail}" if w2 else why2)
                if key in picked:
                    # 이미 있는 줄에 까닭이 없고 이번 것에 있으면 바꿔 단다
                    if why2 and "—" not in picked[key]:
                        picked[key] = line
                    continue
                picked[key] = line
                order.append(key)
                if len(order) >= 5:
                    break
            bits = [picked[k] for k in order]
            # **어떤 상태에서 어떤 시험을 하다 났는지**(지시) — 판정 근거만
            # 적으면 「비교 값이 동일 하지 않습니다」 가 전부라, 무슨 시험인지
            # 모른 채 읽게 된다. 시험 이름을 앞에 세워 문맥을 준다.
            # 깨진 줄에 이미 그 시험 이름이 들어 있으면 두 번 적지 않는다.
            tcname = _re_sub_oid(name or tcid)
            body_sym = ", ".join(bits)
            if tcname and body_sym and tcname not in body_sym:
                sym = f"{tcname} 시험에서 {body_sym}"
            else:
                sym = body_sym or f"{tcname} 부적합"

            # **요약은 현상과 같은 말이다**(지시). 앞에 [UTOP] 을 붙여 자동으로
            # 등록한 것임을 지라에서 바로 알아보게 한다.
            # 머리말은 **[UTOP] 하나뿐**이다(지시). 제품·버전은 결함의 제
            # 칸과 「4. 시험내역」 링크가 말한다 — 요약에 넣으면 정작 증상이
            # 뒤로 밀린다.
            title = f"[UTOP] {sym}"
            if len(title) > 150:
                title = title[:150].rstrip() + "…"

            # 판마다 맡는 말이 다르다(지시).
            #  · 3. 시험절차 — **스텝 설명만 차례대로**. 시험 항목으로 가는
            #    주소 한 줄이던 때는, 이슈를 받은 사람이 UTOP 계정이 없어
            #    아무 데도 못 갔다. 무엇을 어떤 차례로 했는지는 이슈 안에 있다.
            #  · 4. 시험내역 — **CLI·결과값·판정**. 이름을 붙여 적는다.
            #    이름이 없으면 어디까지가 장비가 뱉은 것이고 어디부터가 우리
            #    판단인지 읽는 사람이 가려내야 한다.
            # 두 판이 같은 말을 나눠 갖는다 — 겹쳐 적으면 어느 쪽이 정본인지
            # 알 수 없다.
            # **빵부스러기는 글에 적지 않는다.** 판마다 머리에 칩으로 서고,
            # 지라로 올릴 때 본문 맨 위에 한 번 들어간다(화면이 붙인다).
            # 여기서 글에 섞어 두면 입력칸에 위키 표기가 그대로 보이고
            # (지적), 주소도 실행기가 부른 내부 주소(http://api:8000)가 박혀
            # 사람이 눌러도 아무 데도 못 간다.
            proc_lines: list[str] = []
            for b in briefs:
                what = str(b.get("desc") or "").strip() or _plain_ko(str(b.get("cli") or ""))
                what = " ".join(what.split())
                if not what:
                    continue
                proc_lines.append(f"{len(proc_lines) + 1}) {what}")
            proc = "\n".join(proc_lines) or f"{tcid} 자동 시험"

            det_lines: list[str] = []
            for b in briefs[:20]:
                what = str(b.get("desc") or "").strip() or _plain_ko(str(b.get("cli") or ""))
                cli = " ".join(str(b.get("cli") or "").strip().split())
                st2 = str(b.get("status") or "").strip()
                out0 = str(b.get("output") or "").strip()
                why0 = str(b.get("reason") or "").strip()
                # **아무것도 없는 스텝은 적지 않는다.** 설명도 명령도 출력도
                # 까닭도 없이 판정만 붙은 껍데기가 섞이는데, 그대로 적으면
                # 「판정: FAIL」 만 덩그러니 선 줄이 이슈를 채운다.
                if not (what or cli or out0 or why0):
                    continue
                head = what or cli
                det_lines.append(f"*#{b.get('no')}{' ' + head if head else ''}*")
                if cli:
                    det_lines.append("CLI: {{" + cli + "}}")
                out2 = str(b.get("output") or "").strip()
                if out2:
                    det_lines.append("결과값:")
                    det_lines.append("{noformat}")
                    det_lines.append(out2[:1500])
                    det_lines.append("{noformat}")
                else:
                    det_lines.append("결과값: （없음）")
                # 판정은 **제 줄에 선다** — 스텝 이름 옆에 붙여 두면 스무 줄짜리
                # 출력 위에 묻혀, 무엇이 깨졌는지 눈으로 좇아야 한다.
                up = st2.upper()
                mark = "(/) " if up.startswith("P") else ("(x) " if up.startswith("F") else "")
                why3 = _plain_ko(str(b.get("reason") or ""))
                det_lines.append(f"판정: {mark}{st2 or '미실행'}" + (f" — {why3}" if why3 else ""))
                det_lines.append("")
            det = "\n".join(det_lines).strip() or f"{tcid} 자동 시험"

            await db.defect_create({
                **extra,
                "panels": {"symptom": sym, "steps": proc, "detail": det},
                "id": did,
                # 새로 난 결함은 **New** 다(지시) — 「미해결」 탭은 닫히지
                # 않은 것을 모두 담으므로 여기서도 보인다
                "status": "New",
                "title": title,
                "cycle_id": cid,
                "cycle_name": " · ".join([x for x in (model, version) if x]),
                "tcid": tcid,
                "tc_name": name or tcid,
                "model": model,
                "version": version,
                "steps": briefs,
                "note": "자동 시험에서 부적합이 나와 자동으로 등록했습니다.",
                "created_by": "실행기",
            })
            # 보고 있는 화면이 **그 자리에서** 늘어나게 알린다(지시: 실시간)
            try:
                asyncio.create_task(core.broadcast({"type": "defect_updated", "id": did, "cycle_id": cid}))
            except Exception:
                pass
            return
        except Exception:
            continue


@router.post("/api/plan-runs/{run_id}/item")
async def api_plan_run_item_put(run_id: str, payload: dict, request: Request = None):
    """실행기가 항목 하나를 마칠 때마다 부른다.

    사이클 문서와 달리 **덮어쓰지 않는다** — 회차마다 한 줄이 선다.
    fold 면 앞 회차와 결과가 같을 때 전문을 또 쌓지 않는다."""
    p = payload or {}
    tcid = str(p.get("tcid") or "").strip()
    if not tcid:
        raise HTTPException(400, "tcid 가 없습니다")
    body = p.get("data")
    verdict = str(p.get("verdict") or "")
    out = await db.plan_run_item_put(
        run_id, tcid, int(p.get("round") or 1), verdict,
        str(p.get("at") or ""), int(p.get("took_ms") or 0),
        body if isinstance(body, dict) else {},
        bool(p.get("fold", True)),
    )
    # 깨졌으면 결함을 만든다(지시) — 실패해도 위 저장은 이미 끝났다
    try:
        if verdict and verdict in await db._bad_verdicts():
            # 결함에 적을 링크의 앞머리 — 설정(app_url)이 비었을 때 쓴다
            try:
                _base = str(request.base_url).strip() if request is not None else ""
            except Exception:
                _base = ""
            await _auto_defect(run_id, tcid, body if isinstance(body, dict) else {}, _base)
    except Exception:
        pass
    return out


@router.post("/api/cycle/{cycle_id}")
async def save_cycle(cycle_id: str, data: dict, request: Request = None):
    # 부여 ID — 없을 때만 새로 매긴다. 한 번 박히면 영원하다…
    if not str((data or {}).get("cid") or "").strip():
        try:
            _pfx, _w = await _cycle_cid_prefix(data or {})
            data["cid"] = await db.cycle_next_cid(_pfx, _w)
        except Exception:
            pass
    else:
        # …단 하나의 예외(지적: 새 플랜 Key 가 E61xx 로 시작하지 않는다).
        # 제목만 치고 만들면 모델그룹을 몰라 옛 규칙(C-2635-001)을 받는데,
        # 곧이어 모델그룹을 채워도 Key 가 그대로였다. **결과가 하나도 없는**
        # 플랜은 아직 아무도 그 Key 를 문 데가 없으므로 새 규칙으로 다시
        # 매긴다. 결과가 쌓였으면 안 바꾼다 — 결함·링크가 그 ID 를 문다.
        try:
            _pfx, _w = await _cycle_cid_prefix(data or {})
            _cid = str(data.get("cid") or "")
            # 옛 이음쇠(_)로 박힌 것도 **같은 앞머리**로 본다. 아직 ID 를
            # 안 옮긴 서버에서 저장만 해도 번호가 갈리면 안 된다.
            _pfx_old = _pfx[:-2] + "_" + _pfx[-1] if len(_pfx) >= 2 else _pfx
            if _w == 4 and not (_cid.startswith(_pfx) or _cid.startswith(_pfx_old)):
                _items = data.get("items") or []
                _fresh = all(
                    not str(it.get("result") or "").strip()
                    and not any(
                        str(st.get("result") or "").strip() for st in (it.get("steps") or [])
                    )
                    for it in _items
                )
                if _fresh:
                    data["cid"] = await db.cycle_next_cid(_pfx, _w)
                    data["ce"] = ""
                    for it in _items:
                        it.pop("ceid", None)  # exec-ids 가 새 cid 로 다시 매긴다
                    print(f"[cycle] cid 재부여 {_cid} → {data['cid']}", flush=True)
        except Exception:
            pass
    # **수동 시험도 결함을 남긴다**(지시: 수동에서 Fail 로 바꿔도 Cycles
    # Defects 에 안 남는다). 자동 시험은 실행기가 항목을 마칠 때 만들지만,
    # 수동은 사람이 판정을 바꿔 이 길로 저장한다.
    #
    # **새로 Fail 이 된 것만** 만든다. 저장할 때마다 Fail 항목을 훑어 만들면,
    # 사람이 지운 결함이 다음 저장에 되살아난다 — 그래서 저장 직전의 판정을
    # 먼저 기억해 둔다.
    _was: dict = {}
    try:
        _old = await db.cycle_get(cycle_id) or {}
        for _it in (_old.get("items") or []):
            if isinstance(_it, dict):
                _was[str(_it.get("tcid") or "")] = str(_it.get("result") or "")
    except Exception:
        pass

    await db.cycle_upsert(cycle_id, data)

    try:
        _bad = await db._bad_verdicts()
        try:
            _b = str(request.base_url).strip() if request is not None else ""
        except Exception:
            _b = ""
        _by0 = str((data or {}).get("updated_by") or "").strip()
        for _it in (data.get("items") or []):
            if not isinstance(_it, dict):
                continue
            _tc = str(_it.get("tcid") or "")
            _rs = str(_it.get("result") or "")
            if not _tc or _rs not in _bad or _was.get(_tc, "") in _bad:
                continue
            # 결함 만들기가 저장을 막지 않게 뒤로 보낸다 — 한 항목이 지라
            # 기본값을 묻는 동안 사람이 기다릴 이유가 없다.
            asyncio.create_task(_auto_defect(
                "", _tc, {"steps": _it.get("steps") or []}, _b,
                cycle_id=cycle_id, who_in=_by0,
            ))
    except Exception:
        pass

    # 누가 고쳤는지 함께 싣는다. 받는 쪽이 「내가 방금 저장한 것」 을 걸러야
    # 하고, 남이 한 것이면 이름을 말해 줘야 한다 — 플랜은 여럿이 나눠
    # 돌리는 자리라 「누가 3번을 Fail 로 바꿨나」 가 곧 알아야 할 일이다.
    _by = str((data or {}).get("updated_by") or "").strip()
    try:
        asyncio.create_task(core.broadcast({"type": "cycle_updated", "cycle_id": cycle_id, "user": _by}))
    except Exception:
        pass
    return {"success": True}

@router.post("/api/cycle/{cycle_id}/exec-ids")
async def cycle_exec_ids(cycle_id: str):
    """실행 ID 부여 — 플랜에 포함되는 값이다.

    CE 는 플랜 ID 에서 파생한다 (C-2633-002 → CE-2633-002). 플랜:실행이
    1:1 이라는 결정 그대로 — 재시험은 Clone 이 새 플랜을 만드니 새 CE 다.
    항목은 CETC-<파생>-NN. 멱등이라 실행 화면에 들어올 때마다 불러도 되고,
    나중에 항목을 더 넣으면 빈 번호만 채운다."""
    data = await db.cycle_get(cycle_id)
    if not data:
        raise HTTPException(404, "플랜이 없습니다")
    cid = str(data.get("cid") or "").strip()
    if not cid:
        try:
            _pfx, _w = await _cycle_cid_prefix(data)
            cid = await db.cycle_next_cid(_pfx, _w)
            data["cid"] = cid
        except Exception:
            cid = ""
    base = cid[2:] if cid.startswith("C-") else cid
    changed = False
    if base:
        if not str(data.get("ce") or "").strip():
            data["ce"] = f"CE-{base}"
            changed = True
        items = data.get("items") or []
        used = set()
        for it in items:
            if isinstance(it, dict):
                m = str(it.get("ceid") or "")
                if m.startswith(f"CETC-{base}-"):
                    try:
                        used.add(int(m.rsplit("-", 1)[1]))
                    except ValueError:
                        pass
        nxt = 1
        for it in items:
            if not isinstance(it, dict) or str(it.get("ceid") or "").strip():
                continue
            while nxt in used:
                nxt += 1
            it["ceid"] = f"CETC-{base}-{nxt:02d}"
            used.add(nxt)
            changed = True
    if changed:
        await db.cycle_upsert(cycle_id, data)
    return {"ce": str(data.get("ce") or ""), "changed": changed}

@router.delete("/api/cycle/{cycle_id}")
async def delete_cycle(cycle_id: str):
    await db.cycle_delete(cycle_id)
    try: asyncio.create_task(core.broadcast({"type": "cycle_deleted", "cycle_id": cycle_id}))
    except Exception: pass
    return {"success": True}


# ───────────────────────────────────────────
# 라우터 - 시험 절차
# ───────────────────────────────────────────
@router.get("/api/procedures")
async def get_procedures():
    return core.load_json(core.PROCEDURES_FILE)

class ProcedureCreate(BaseModel):
    group: str
    model: str
    name: str
    description: str = ""
    steps: list = []

@router.post("/api/procedures")
async def add_procedure(proc: ProcedureCreate):
    data = core.load_json(core.PROCEDURES_FILE)
    new_id = f"proc{len(data['procedures'])+1:03d}"
    new_proc = {"id": new_id, **proc.model_dump()}
    data["procedures"].append(new_proc)
    core.save_json(core.PROCEDURES_FILE, data)
    return {"success": True, "procedure": new_proc}

@router.put("/api/procedures/{proc_id}")
async def update_procedure(proc_id: str, proc: ProcedureCreate):
    data = core.load_json(core.PROCEDURES_FILE)
    for i, p in enumerate(data["procedures"]):
        if p["id"] == proc_id:
            data["procedures"][i] = {"id": proc_id, **proc.model_dump()}
            core.save_json(core.PROCEDURES_FILE, data)
            return {"success": True}
    raise HTTPException(404, "절차를 찾을 수 없습니다")

@router.delete("/api/procedures/{proc_id}")
async def delete_procedure(proc_id: str):
    data = core.load_json(core.PROCEDURES_FILE)
    data["procedures"] = [p for p in data["procedures"] if p["id"] != proc_id]
    core.save_json(core.PROCEDURES_FILE, data)
    return {"success": True}

# ───────────────────────────────────────────
# 라우터 - 시험 실행
# ───────────────────────────────────────────
@router.post("/api/run/{proc_id}")
async def run_procedure(proc_id: str):
    proc_data = core.load_json(core.PROCEDURES_FILE)
    proc = next((p for p in proc_data["procedures"] if p["id"] == proc_id), None)
    if not proc:
        raise HTTPException(404, "절차를 찾을 수 없습니다")

    dev_data = core.load_json(core.DEVICES_FILE)
    device = next((d for d in dev_data["devices"] if d["model"] == proc["model"]), None)

    result_id = f"result_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    results = []

    await core.broadcast({"type": "run_start", "proc_id": proc_id, "proc_name": proc["name"]})

    for step in proc.get("steps", []):
        await core.broadcast({"type": "step_start", "seq": step["seq"], "name": step["name"]})
        output = ""
        status = "PASS"

        try:
            if step["type"] == "CLI" and device:
                proto = device.get("protocol", "").upper()
                if proto == "SSH":
                    output = core.ssh_exec(device["ip"], device["port"], device["username"], device["password"], step["command"])
                elif proto == "TELNET":
                    output = await asyncio.to_thread(engine.netmiko_exec, device, step["command"])
                else:
                    output = f"[{proto}] CLI 명령 실행"
            elif step["type"] == "TCL":
                output = f"[TCL] {step['command']} 실행 시뮬레이션\n트래픽 생성 완료"
            elif step["type"] == "API":
                output = f"[API] {step['command']} 실행 완료"
            elif step["type"] == "검증":
                output = f"[검증] {step['command']}\n결과: 정상"
            elif step["type"] == "리포트":
                output = "[리포트] 결과 저장 완료"
            else:
                output = f"[{step['type']}] {step['command']}"
        except Exception as e:
            output = str(e)
            status = "FAIL"

        step_result = {
            "seq": step["seq"],
            "name": step["name"],
            "type": step["type"],
            "output": output,
            "status": status
        }
        results.append(step_result)
        await core.broadcast({"type": "step_done", **step_result})
        await asyncio.sleep(0.3)

    final = {
        "id": result_id,
        "proc_id": proc_id,
        "proc_name": proc["name"],
        "model": proc["model"],
        "timestamp": datetime.now().isoformat(),
        "steps": results,
        "overall": "PASS" if all(r["status"] == "PASS" for r in results) else "FAIL"
    }
    result_path = core.RESULTS_DIR / f"{result_id}.json"
    core.save_json(result_path, final)
    await core.broadcast({"type": "run_done", "result": final})
    return final

@router.get("/api/results")
async def get_results():
    results = []
    for f in sorted(core.RESULTS_DIR.glob("*.json"), reverse=True)[:20]:
        results.append(core.load_json(f))
    return {"results": results}


# ── Cycle → Markdown 변환 · RAG 색인 · AI 요약 ──
def _step_verdict(s):
    """스텝 하나의 판정 — 화면(types.ts stepVerdict)과 **글자 하나까지 같게**.

    실행기는 `status`(PASS/FAIL)·`repeatResult`(Pass/Fail) 에 적고, 옛 자료와
    손 입력은 `result` 에 있다.

    아는 판정만 판정으로 친다. `repeatResult` 에는 「실행완료」 처럼 판정이
    아닌 말도 들어 있어서, 그것을 그대로 판정으로 읽으면 셈이 어긋난다.
    """
    legacy = str(s.get("result") or "").strip()
    if legacy:
        return _norm_verdict(legacy)
    # 화면은 `status ?? repeatResult` — status 가 아예 없을 때만 옛 칸을 본다
    v = s.get("status")
    if v is None:
        v = s.get("repeatResult")
    u = str(v or "").strip().upper()
    return u if u in ("PASS", "FAIL", "WIP", "BLOCKED") else ""


def _norm_verdict(v):
    """같은 판정을 부르는 이름이 여럿이다 — 한 가지로 모은다."""
    u = str(v or "").strip().upper()
    if u in ("PASS", "합격"):
        return "PASS"
    if u in ("FAIL", "불합격"):
        return "FAIL"
    if u in ("N/A", "NA", "진행불가"):
        return "N/A"
    return str(v or "").strip()


def _item_verdict(item):
    """항목 판정 — **화면(Cycles.tsx itemVerdict)과 같은 규칙**.

    여태 이 함수만 항목의 `status` 칸을 함께 읽었다. 화면은 `result` 만 본다.
    그래서 한 번 깨진 뒤 다시 돌린 항목처럼 두 칸이 어긋난 자료에서, **상세는
    Pass 인데 목록의 「최근 결과」는 Fail** 이 됐다(지적). 판정을 두 규칙으로
    내리면 둘 중 하나는 반드시 틀린다 — 화면 쪽으로 맞춘다.

    `미실행` 은 값이 아니라 표식이다. 사람이 「이건 안 돌린 것으로 둬라」 고
    적어 둔 것이라, 스텝에 결과가 남아 있어도 판정으로 올리지 않는다.
    """
    r = str(item.get("result") or "").strip()
    if r == "미실행":
        return ""
    if r:
        return _norm_verdict(r)
    steps = item.get("steps") or []
    # 수동 스텝은 자동 판정에서 뺀다 — 사람이 보는 것은 사람이 따로 적는다
    auto = [
        s for s in steps
        if isinstance(s, dict) and not db.is_manual_step(s)
    ]
    if not auto:
        return "N/A" if steps else ""
    rs = [_step_verdict(s) for s in auto]
    if len(auto) == 1:
        return rs[0]
    if any(x == "FAIL" for x in rs):          # Fail 하나라도 → Fail
        return "FAIL"
    if any(x == "PASS" for x in rs):          # Fail 없고 Pass 있으면 → Pass
        return "PASS"
    # 메시지·주석처럼 판정이 없는 줄뿐이면 그 줄의 말을 그대로 (없으면 미실행)
    return next((x for x in rs if x), "")


def _cycle_result_ctx(cycle, fails_detail=True):
    """Cycle 실행 결과를 LLM 컨텍스트 문자열로 요약."""
    items = cycle.get("items") or []
    p = f = na = un = 0
    rows = []
    for it in items:
        v = _item_verdict(it)
        if v == "PASS":
            p += 1
        elif v == "FAIL":
            f += 1
        elif v in ("N/A", "NA"):
            na += 1
        else:
            un += 1
        rows.append(f"- {it.get('tcid','')} {it.get('name','')}: {v or '미실행'}" + (f" — {it.get('memo')}" if it.get("memo") else ""))
    head = (f"Cycle: {cycle.get('id','')} / 모델 {cycle.get('model','')} / 버전 {cycle.get('version','')}\n"
            f"실행일시: {cycle.get('executed_at','')}\n"
            f"전체 {len(items)} · Pass {p} · Fail {f} · N/A {na} · 미실행 {un}\n\n[항목별 결과]\n" + "\n".join(rows))
    if fails_detail:
        fd = []
        for it in items:
            if _item_verdict(it) != "FAIL":
                continue
            fd.append(f"\n■ FAIL: {it.get('tcid','')} {it.get('name','')}")
            for i, s in enumerate(it.get("steps") or [], 1):
                # 판정은 **_step_verdict 한 곳**으로 — 여태 이 줄만 옛 칸(result)을
                # 봤다. 실행기는 status·repeatResult 에 적으므로 실자료에 result 는
                # 한 건도 없고, 그래서 Fail 이 208 스텝이어도 [Fail 상세] 가 통째로
                # 비어 나갔다. 근거를 못 받은 채 「Fail 분석」 을 시키면 지어낸다.
                if not isinstance(s, dict) or _step_verdict(s) != "FAIL":
                    continue
                fd.append(f"  - Step{i} {s.get('desc','')} / CLI `{s.get('cli','')}` / 기대({s.get('type','')}): {s.get('criteria','')}")
                out = str(s.get("output") or "").strip()
                if out:
                    fd.append("    출력(끝부분): " + out[-400:].replace("\n", " ⏎ "))
        if fd:
            head += "\n\n[Fail 상세]" + "\n".join(fd)
    return head

# ── Test Summary 보고서 — 표는 **서버가 만든다** ──
#
# 숫자가 든 표를 LLM 에게 맡기면 지어낸다. Pass/Fail 은 저장할 때 이미 세어 둔
# 값(data_summary)이 정본이므로, 표는 그 값으로 코드가 짜고 LLM 에게는 **문장만**
# 맡긴다(지시: 시험 표 넣고 문구는 이런 형태로).
#
# 표는 반드시 **바깥 파이프로 감싼 GFM 파이프 표**다. 셀 병합(2단 머리)은 쓰지
# 않는다 — 화면(BlockNote)에서는 살지만 메일 변환기에서 태그가 글자로 새어 나온다.
# 그래서 「RFP」 아래 Total/Pass/Fail 같은 2단 머리는 한 줄로 편다.

# 맺음말은 늘 같은 문장이다 — 사람이 쓰는 그대로 코드가 붙인다(지시)
_RP_TAIL = ("자세한 시험 결과 및 이슈 내역은 아래 참고 부탁 드리며, "
            "시험 항목에 대해서는 첨부 파일에 정리하였습니다.")

# 옛 기본 프롬프트. 설정에 이 값이 **그대로** 저장돼 있으면 사람이 적은 것이
# 아니라 화면이 기본값을 저장한 것이라, 새 형식과 부딪치지 않게 안 쓴다.
_OLD_CYCLE_SUMMARY_SYS = (
    "당신은 네트워크 장비 시험(QA) 결과 분석 전문가다. 주어진 회차 결과를 "
    "근거로 한국어 Markdown 보고서를 쓴다.\n"
    "규칙:\n"
    "1) 총평 한 문단 — 이 버전을 내보내도 되는가에 답한다.\n"
    "2) 전체·수동·자동 현황을 표로.\n"
    "3) 깨진 항목은 무엇이 왜 깨졌는지 묶어서 적는다. 스텝 번호를 밝힌다.\n"
    "4) 결과에 없는 것은 쓰지 않는다 — 미실행은 미실행이라고 적는다."
)


def _rp_squash(t) -> str:
    """공백만 다른 글은 같은 글로 본다 — 저장값이 옛 기본값인지 가릴 때 쓴다"""
    return re.sub(r"\s+", "", str(t or ""))


def _bare_name(who) -> str:
    """표시 이름에서 꼬리를 뗀다 — 「장수완(검증)_종합시험팀」 → 「장수완」"""
    return re.split(r"[(\[_]", str(who or ""))[0].replace(" ", "").strip()


def _yymd(d) -> str:
    """2026-09-11 → 26/09/11 — 보고서가 쓰는 꼴"""
    x = str(d or "")[:10]
    return f"{x[2:4]}/{x[5:7]}/{x[8:10]}" if len(x) == 10 and x[4] == "-" else ""


def _md_table(head, rows, left=()) -> str:
    """GFM 파이프 표. 바깥 파이프로 감싸야 화면·메일 **양쪽**이 표로 읽는다.

    `left` 에 넣은 칸은 왼쪽으로 붙인다 — 시험 항목 이름처럼 긴 글은 가운데로
    맞추면 눈이 줄을 못 따라간다. 숫자 칸은 가운데가 읽기 좋다.
    """
    if not rows:
        return ""
    al = [":---" if (i == 0 or i in left) else ":---:" for i in range(len(head))]
    out = ["| " + " | ".join(str(h) for h in head) + " |",
           "| " + " | ".join(al) + " |"]
    for r in rows:
        out.append("| " + " | ".join("" if c is None else str(c) for c in r) + " |")
    return "\n".join(out)


def _rp_rate(t) -> str:
    return f"{round(t['pass'] * 100 / t['total'], 1)}%" if t["total"] else "-"


def _rp_tally(items, verdict) -> dict:
    """항목 목록을 센다. 판정 함수를 받아 **목록 경로와 상세 경로를 한 규칙으로** 센다.

    목록(data_summary)은 저장할 때 세어 둔 `_verdict`(Pass/Fail)를, 상세(items)는
    `_item_verdict`(PASS/FAIL)를 쓴다 — 대소문자가 달라 한 곳에서 맞춘다.
    """
    t = {"total": 0, "pass": 0, "fail": 0, "none": 0}
    for it in items:
        if not isinstance(it, dict):
            continue
        t["total"] += 1
        v = str(verdict(it) or "").strip().upper()
        if v == "PASS":
            t["pass"] += 1
        elif v == "FAIL":
            t["fail"] += 1
        else:
            t["none"] += 1
    return t


def _rp_span(meta) -> str:
    """시험일 — **실제로 돌린 날**의 처음~끝. 한 번도 안 돌렸으면 만든 날.

    사이클의 start_date·end_date 는 사람이 손으로 채우는 칸이라 대개 비어 있고,
    updated_at 은 어떤 쓰기에도 오늘로 덮여 회차마다 「오늘 끝났다」가 된다.
    항목에 남은 실행 시각만이 실제로 시험한 날을 말한다.
    """
    ds = sorted({
        str(it.get("executed_at") or "")[:10]
        for it in (meta.get("items") or [])
        if isinstance(it, dict) and it.get("executed_at")
    })
    ds = [d for d in ds if len(d) == 10]
    if ds:
        a, b = _yymd(ds[0]), _yymd(ds[-1])
        return a if a == b else f"{a} ~ {b}"
    return _yymd(meta.get("_created_at_pg")) or "-"


def _rp_number(secs) -> str:
    """살아남은 절에만 1..N 을 다시 매긴다.

    자료가 없는 절은 **번호째** 뺀다 — 빈 표를 내면 「시험을 안 했다」 로 읽히고,
    번호가 뛰면 「무엇이 지워졌다」 로 읽힌다.
    머리는 `##`·`###` 두 단만 쓴다. 화면도 메일도 그 아래로는 깎아 버린다.
    """
    out, n = [], 0
    for s in secs:
        if not s or not str(s[1] or "").strip():
            continue
        n += 1
        out.append(f"## {n}. {s[0]}\n\n{str(s[1]).strip()}")
    return "\n\n".join(out)


def _rp_is_auto(it) -> bool:
    st = [x for x in (it.get("steps") or []) if isinstance(x, dict)]
    return any(not db.is_manual_step(x) for x in st)


def _rp_split(items):
    """자동·수동으로 가른다 — 지금 자료로 **믿을 수 있는 유일한 묶음**이다.

    보고서 양식은 RFP·표준Config·IPv6·Aging 으로 가르지만, 그 분류를 담은 칸이
    시험항목에 없다(이름·스텝·요구사항 어디에도 없음을 확인했다). 없는 축으로
    표를 만들면 숫자가 지어낸 값이 된다.
    """
    return [("자동", [x for x in items if _rp_is_auto(x)]),
            ("수동", [x for x in items if not _rp_is_auto(x)])]


def _rp_sec_sched(items):
    """시험 일정 — 사람이 정한 일정은 어디에도 없다. **실제로 돌린 날**로 적는다."""
    rows = []
    for label, sub in _rp_split(items):
        if not sub:
            continue
        rows.append([label, _rp_span({"items": sub}), f"{len(sub)}건"])
    if not rows:
        return None
    return ("시험 일정", _md_table(["구분", "기간", "항목"], rows, left=(1,)))


def _rp_progress(t) -> str:
    """진행률 — 돌린 것 / 전체. **통과율과 다른 값이다**(통과율은 붙은 것 / 전체)."""
    if not t["total"]:
        return "-"
    return f"{round((t['total'] - t['none']) * 100 / t['total'], 1)}%"


def _rp_sec_progress_body(cycle, cycle_id, items, kin):
    """시험 진행 내역 — 어느 회차인지 밝히고, 현황과 회차별 이력을 붙인다."""
    parts = []
    tot = _rp_tally(items, _item_verdict)
    cid = str(cycle.get("cid") or "").strip() or str(cycle_id)
    nm = str(cycle.get("name") or cycle.get("version") or "").strip()
    parts.append(
        f"- Test Cycle : **{cid}**" + (f" ({nm})" if nm else "")
        + f"\n- 진행률 : **{_rp_progress(tot)}** ({tot['total'] - tot['none']}/{tot['total']}건)"
        + f" · Pass {tot['pass']} · Fail {tot['fail']} · 미실행 {tot['none']}"
    )
    # 현황 — 합계·자동·수동
    rows = []
    for label, sub in [("합계", items)] + [(a, b) for a, b in _rp_split(items) if b]:
        t = _rp_tally(sub, _item_verdict)
        rows.append([f"**{label}**" if label == "합계" else label,
                     t["total"], t["pass"], t["fail"], t["none"], _rp_progress(t), _rp_rate(t)])
    if rows:
        parts.append("### 시험 결과 현황\n\n" + _md_table(
            ["구분", "Total", "Pass", "Fail", "미실행", "진행률", "통과율"], rows))
    # 버전별 실행 이력 — 회차가 하나뿐이면 견줄 것이 없어 내지 않는다
    if len(kin) > 1:
        vrows = []
        for i, m in enumerate(kin, 1):
            t = _rp_tally(m.get("items") or [], lambda it: it.get("_verdict") or it.get("result"))
            cur = str(m.get("id") or "") == str(cycle_id)

            def b(x, _c=cur):
                return f"**{x}**" if _c else str(x)

            vrows.append([b(i), b(m.get("version_group") or "-"),
                          b(m.get("version") or m.get("name") or "-"), b(_rp_span(m)),
                          b(t["total"]), b(t["pass"]), b(t["fail"]), b(t["none"]), b(_rp_rate(t))])
        parts.append("### 버전별 실행 이력\n\n" + _md_table(
            ["No", "버전그룹", "Version Name", "시험일", "Total", "Pass", "Fail", "미실행", "통과율"],
            vrows, left=(2,)))
    return ("시험 진행 내역", "\n\n".join(parts))


async def _rp_sec_issue(cycle, cycle_id, items):
    """이슈내역 — 등록된 결함이 주인. 없으면 깨진 항목을 몇 줄만.

    「문제유형」(「[05]조회오류」 꼴)은 결함에 칸이 없다. 지라에서 받아 둔 이슈
    (jira_issue.data.probtype)에만 있어 이슈 키로 이어 붙인다.
    「상태」도 결함의 것은 우리 쪽 흐름(open·New·pushed)이라 지라의 ASSIGN·CLOSED 와
    다르다 — 이어 붙인 지라 이슈가 있으면 그쪽 상태를 적는다.
    """
    try:
        defs = await db.defect_list(cycle_id=str(cycle_id), limit=300)
    except Exception:
        defs = []
    ver = str(cycle.get("version") or "-")

    def _cut(t, n=48):
        t = str(t or "-").strip()
        return t if len(t) <= n else t[: n - 1] + "…"

    if defs:
        keys = [str(d.get("jira_key") or "").strip() for d in defs]
        keys = [k for k in keys if k]
        extra: dict = {}
        if keys:
            try:
                async with db.pool().acquire() as _c:
                    for r in await _c.fetch(
                        "SELECT key, data->>'probtype' AS probtype, data->>'status' AS status "
                        "FROM jira_issue WHERE key = ANY($1::text[])", keys):
                        extra[str(r["key"])] = {"probtype": r["probtype"] or "",
                                                "status": r["status"] or ""}
            except Exception:
                extra = {}
        rows = []
        for d in defs:
            k = str(d.get("jira_key") or "").strip()
            x = extra.get(k) or {}
            rows.append([len(rows) + 1, k or str(d.get("id") or "-"), _cut(d.get("title")),
                         d.get("issue_type") or "-", x.get("probtype") or "-",
                         x.get("status") or d.get("status") or "-",
                         d.get("version") or ver])
        return ("이슈내역", _md_table(
            ["No", "UMS", "이슈내용", "이슈유형", "문제유형", "상태", "발생 Version"],
            rows, left=(1, 2, 3, 4, 5)))

    # 올린 이슈가 없으면 **이 절을 통째로 뺀다**(지시). 깨진 항목을 이슈인 양
    # 늘어놓으면 「이슈 47건」 으로 읽힌다 — 아직 이슈가 아니라 Fail 일 뿐이다.
    return None


async def _rp_sec_topo(items):
    """시험구성도 — 시험항목에 붙여 둔 그림을 가져온다.

    구성도는 시험항목(TC)에만 있고 사이클에는 없다. 이 회차가 쓴 항목들의 그림 중
    **가장 많이 쓰인 것**을 대표로 싣는다. 하나도 없으면 이 절을 통째로 뺀다.
    """
    tcids = [str(it.get("tcid") or "") for it in items if it.get("tcid")]
    if not tcids:
        return None
    try:
        async with db.pool().acquire() as c:
            rows = await c.fetch(
                "SELECT data->>'topo_img' AS img, count(*) AS n FROM tc "
                "WHERE tcid = ANY($1::text[]) AND COALESCE(data->>'topo_img','') <> '' "
                "GROUP BY 1 ORDER BY 2 DESC LIMIT 1", list(set(tcids)))
    except Exception:
        return None
    if not rows:
        return None
    img = str(rows[0]["img"] or "").strip()
    if not img:
        return None
    return ("시험구성도", f"![구성도]({img})")


async def _cycle_report_tables(cycle, cycle_id) -> str:
    """보고서 본체 — **번호 매긴 절들.**

    양식은 「일정 · 담당자 · 진행 내역 · 이슈내역 · 구성도」 차례다(지시). 자료가
    없는 절은 번호째 뺀다 — 빈 표를 내면 시험을 안 한 것으로 읽힌다.
    """
    items = [x for x in (cycle.get("items") or []) if isinstance(x, dict)]

    # 같은 모델그룹의 회차를 **만든 차례대로**. updated_at 으로 세우면 안 된다 —
    # 요약을 한 번 저장할 때마다 순서가 바뀐다.
    try:
        metas = await db.cycle_list_meta()
    except Exception:
        metas = []
    mg = str(cycle.get("model_group") or "").strip()
    mdl = str(cycle.get("model") or "").strip()

    def _same(m):
        if mg and str(m.get("model_group") or "").strip() == mg:
            return True
        return bool(mdl) and str(m.get("model") or "").strip() == mdl

    kin = sorted([m for m in metas if _same(m)], key=lambda m: str(m.get("_created_at_pg") or ""))

    secs = [
        _rp_sec_sched(items),
        # 시험담당자 절은 두지 않는다 — 인사말이 이미 누가 쓴 글인지 말한다(지시)
        _rp_sec_progress_body(cycle, cycle_id, items, kin),
        await _rp_sec_issue(cycle, cycle_id, items),
        await _rp_sec_topo(items),
    ]
    return _rp_number(secs)


def _rp_who(user, cycle) -> tuple[str, str]:
    """이 글을 쓴 사람의 (이름, 팀) — 인사말과 맺음말이 **같은 값**을 써야 한다.

    이름은 계정에, 팀은 조직도에 있다(계정의 dept 는 Jira 꼬리에서 뽑은 값이라
    「검증팀」 처럼 틀린 이름이 된다 — 조직도가 정본이다).
    """
    raw = str((user or {}).get("name") or (user or {}).get("username") or "")
    who = _bare_name(raw) or _bare_name(cycle.get("assignee") or cycle.get("updated_by") or "")
    team = ""
    try:
        team = str((core.org_where(raw) or {}).get("team") or "")
    except Exception:
        pass
    return who, team


def _cycle_greet(user, cycle) -> str:
    """인사말 — **코드가 짓는다.** LLM 에게 맡기면 이름을 지어낸다."""
    who, team = _rp_who(user, cycle)
    if who and team:
        return f"안녕하세요, {team} {who} 입니다."
    return f"안녕하세요, {who} 입니다." if who else "안녕하세요."


def _cycle_sign(user, cycle) -> str:
    """맺음말 — 보고서 **맨 끝**이다(지시: 감사합니다 / -홍길동 드림-)."""
    who, _ = _rp_who(user, cycle)
    return "감사합니다.\n\n-" + who + " 드림-" if who else "감사합니다."


async def _cycle_ai_summary(cycle_id, llm_id: str = ""):
    """Gemma로 Cycle 요약 생성 → cycle 의 ai_summary 에 저장."""
    cycle = await db.cycle_get(cycle_id)
    if cycle is None:
        return None, "Cycle을 찾을 수 없습니다"
    ctx = _cycle_result_ctx(cycle)
    # 전체·수동·자동 집계를 앞에 실어 준다 — 화면 요약 바와 같은 축으로 분석하게
    def _grp_of(it):
        st2 = [x for x in (it.get("steps") or []) if isinstance(x, dict)]
        auto2 = [x for x in st2 if not db.is_manual_step(x)]
        return "자동" if auto2 else "수동"
    _tly = {"전체": {}, "수동": {}, "자동": {}}
    for _it in (cycle.get("items") or []):
        if not isinstance(_it, dict):
            continue
        _v = _item_verdict(_it) or "미실행"
        for _k in ("전체", _grp_of(_it)):
            _tly[_k][_v] = _tly[_k].get(_v, 0) + 1
    def _tline(k):
        d2 = _tly[k]
        n2 = sum(d2.values())
        body = " · ".join(f"{a} {b}건" for a, b in sorted(d2.items(), key=lambda x: -x[1]))
        return f"{k} {n2}건 — {body or '없음'}"
    # 제품 정보 — 실행 화면 정보 상자와 같은 축 (카탈로그의 제조사·제품군 보강)
    _pi_vendor = _pi_family = ""
    _pi_mg = str(cycle.get("model_group") or "").strip()
    try:
        for _c in await db.catalog_list("model"):
            if _c.get("name") == cycle.get("model"):
                _pi_vendor = str(_c.get("vendor") or "").strip()
                _pi_family = str(_c.get("family") or "").strip()
                if not _pi_mg:
                    _pi_mg = str(_c.get("model_group") or "").strip()
                break
    except Exception:
        pass
    _pinfo = " / ".join(
        f"{k} {v}" for k, v in [
            ("제조사", _pi_vendor), ("제품군", _pi_family), ("모델그룹", _pi_mg),
            ("제품명", str(cycle.get("model") or "").strip()),
            ("버전그룹", str(cycle.get("version_group") or "").strip()),
            ("버전명", str(cycle.get("version") or "").strip()),
            ("플랜", (str(cycle.get("cid") or "") + " " + str(cycle.get("name") or "")).strip()),
        ] if v
    )
    # **Fail 과 이슈는 다른 것이다.** Fail 은 깨진 시험이고, 이슈는 사람이 Defects 에
    # 올린 것이다(지적: Fail 47건을 「이슈 47건」 이라 썼다). 둘을 갈라 실어 주지
    # 않으면 AI 가 구별할 길이 없다.
    try:
        _dfs = await db.defect_list(cycle_id=str(cycle_id), limit=300)
    except Exception:
        _dfs = []
    _dn = len(_dfs or [])
    _dline = (f"[등록된 이슈] {_dn}건"
              + (" — " + " · ".join(
                  f"{(d.get('jira_key') or d.get('id') or '')} {str(d.get('title') or '')[:40]}"
                  for d in (_dfs or [])[:5]) if _dn else " (아직 Defects 에 올린 것이 없다)"))
    ctx = ("[제품 정보] " + _pinfo + "\n"
           + "[전체·수동·자동 집계]\n" + "\n".join(_tline(k) for k in ("전체", "수동", "자동")) + "\n"
           + _dline + "\n\n" + ctx)
    # 이 글의 규칙은 **설정이 정본**이다 —
    # SETUP › AI › 용도별 프롬프트 › Cycle-Test Summary.
    # 코드에 박아 두면 사람이 화면에서 보지도 고치지도 못한다(지적). 비우면
    # _prompt_of 가 LLM_PURPOSES 의 기본값으로 내려앉는다.
    _slot = ai._prompt_of("cycle_summary").get("system") or ""
    if _rp_squash(_slot) == _rp_squash(_OLD_CYCLE_SUMMARY_SYS):
        # 옛 기본값이 그대로 저장돼 있으면 **사람이 적은 것이 아니다** — 화면이
        # 기본값을 저장한 것이고, 내용이 「표로 정리하라」 라서 새 형식(표는 서버가
        # 만든다)과 부딪친다. 새 기본값으로 본다.
        _slot = str((ai.LLM_PURPOSES.get("cycle_summary") or {}).get("system") or "")
    sys_p = _slot
    ans, err = await ai._ai_chat([{"role": "system", "content": sys_p}, {"role": "user", "content": ctx}],
                              max_tokens=700, llm_id=llm_id, purpose="cycle_summary")
    if err:
        return None, err

    # ── 글 조립: 인사말·맺음말·표는 **코드가** 붙인다 ──
    #
    # 이름도 건수도 LLM 에게 맡기면 지어낸다. 누가 눌렀는지는 미들웨어가 심어 둔
    # 세션으로 알고, 표는 저장할 때 세어 둔 값으로 짠다.
    try:
        _acct = core.user_from_token("")
    except Exception:
        _acct = None
    body = (ans or "").strip()
    # LLM 이 인사말이나 표를 또 냈으면 걷는다 — 코드가 붙인 것과 겹친다
    body = re.sub(r"^\s*안녕하[세십][요시][^\n]*\n+", "", body)
    body = re.sub(r"(?m)^\s*\|.*\|\s*$\n?", "", body).strip()
    _tables = await _cycle_report_tables(cycle, cycle_id)
    ans = "\n\n".join(x for x in [
        _cycle_greet(_acct, cycle),      # 인사말
        body,                            # 본문 — LLM 이 쓴 두 문단
        _RP_TAIL,                        # 「자세한 내역은 아래 참고…」
        _tables,                         # 번호 매긴 절들
        _cycle_sign(_acct, cycle),       # 맺음말
    ] if x)

    llm = ai._ai_llm(llm_id) or {}
    cycle = await db.cycle_get(cycle_id)   # 재로드(요약 생성 동안의 변경 보존)
    cycle["ai_summary"] = {"text": ans, "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"), "model": llm.get("model", "")}
    await db.cycle_upsert(cycle_id, cycle)
    try:
        await core.broadcast({"type": "cycle_ai_summary", "cycle_id": cycle_id})
    except Exception:
        pass
    return cycle["ai_summary"], None

_cb_run_state = None   # 마지막 실행 진행 상태 — 새로고침으로 재접속한 브라우저가 GET으로 복원

@router.post("/api/cycle-run-progress")
async def cycle_run_progress(payload: dict):
    """클라이언트 주도 Cycle 자동 실행 진행 상태를 전 접속자에게 중계 (WebSocket broadcast).
    다른 계정 브라우저도 실행 배너·진행 중 오버레이·결과 갱신을 실시간으로 받는다.
    주의: /api/cycle/{cycle_id} POST(먼저 등록)가 /api/cycle/run-progress 를 가로채므로 경로를 분리했다."""
    global _cb_run_state
    msg = {"type": "cb_run_progress"}
    for k in ("evt", "ids", "key", "name", "done", "total", "user", "stepIdx", "stepCnt", "stepName", "stepAction", "stepOutput", "stepResult"):
        if k in (payload or {}):
            msg[k] = payload[k]
    if msg.get("evt") == "done":
        _cb_run_state = None
    else:
        st = {k: v for k, v in msg.items() if k != "type"}
        st["_at"] = _t.time()
        _cb_run_state = st
    try:
        await core.broadcast(msg)
    except Exception:
        pass
    return {"ok": True}


@router.get("/api/cycle-run-progress")
async def cycle_run_progress_get():
    """진행 중인 실행 상태 조회 — 새로고침한 접속자가 배너·오버레이를 복원할 때 사용."""
    st = _cb_run_state
    if st and _t.time() - st.get("_at", 0) > 1800:   # 30분 무갱신 → 중단으로 간주
        st = None
    return {"ok": True, "state": st}

@router.post("/api/cycle-run-stop")
async def cycle_run_stop(payload: dict = None, token: str = ""):
    """다른 사용자가 실행 중인 Cycle 자동 실행을 원격으로 중지 요청.
    실행자(브라우저)에게 WebSocket으로 stop 신호 전송 → 실행자 프론트가 tcCheckRunStop 호출.
    누가 요청했는지도 함께 브로드캐스트되어 로그·배너에 표시된다."""
    global _cb_run_state
    u = core.user_from_token(token) if token else None
    requester = (u.get("name") or u.get("username")) if u else ""
    reason = str((payload or {}).get("reason") or "")
    # 실행 상태 즉시 완료 처리 (다른 시청자도 오버레이 해제)
    _cb_run_state = None
    msg = {"type": "cb_run_stop_request", "user": requester, "reason": reason}
    try:
        await core.broadcast(msg)
    except Exception:
        pass
    # done 이벤트도 함께 브로드캐스트 → 오버레이/배너 즉시 정리
    done_msg = {"type": "cb_run_progress", "evt": "done", "user": requester}
    try:
        await core.broadcast(done_msg)
    except Exception:
        pass
    return {"ok": True}

@router.post("/api/cycle/{cycle_id}/summarize")
async def cycle_summarize(cycle_id: str, payload: dict = None):
    # 누구에게 맡길지 화면이 고른다(지시) — 안 고르면 여느 때처럼
    summ, err = await _cycle_ai_summary(cycle_id, str((payload or {}).get("llm") or ""))
    if err:
        return {"ok": False, "error": err}
    return {"ok": True, "summary": summ}

async def _on_cycle_complete(cycle_id, cycle):
    """engine.run_cycle 완료 훅 — RAG 자동 색인(S: TC절차) + 자동 요약(S4). 실패해도 본 실행에 영향 없음."""
    st = ai._ai_settings()
    if st.get("auto_index_tc"):
        try:
            await ai._rag_index_cycle(cycle)
        except Exception:
            pass
    if st.get("auto_summary"):
        try:
            await _cycle_ai_summary(cycle_id)
        except Exception:
            pass


@router.post("/api/cycle/{cycle_id}/auto-jira")
async def cycle_auto_jira(cycle_id: str, payload: dict):
    """Fail 항목 → Gemma로 이슈 제목/설명 생성 → Jira 일괄 등록. {project, issuetype, tcids?, dry_run?}"""
    cycle = await db.cycle_get(cycle_id)
    if cycle is None:
        return {"ok": False, "error": "Cycle을 찾을 수 없습니다"}
    project = str((payload or {}).get("project") or "").strip()
    itype = str((payload or {}).get("issuetype") or "Bug").strip()
    only = set((payload or {}).get("tcids") or [])
    dry = bool((payload or {}).get("dry_run"))
    if not dry and not project:
        return {"ok": False, "error": "Jira 프로젝트 키가 필요합니다"}
    fails = [it for it in (cycle.get("items") or []) if _item_verdict(it) == "FAIL" and (not only or str(it.get("tcid") or "") in only)]
    if not fails:
        return {"ok": True, "issues": [], "message": "Fail 항목이 없습니다"}
    schema = {"type": "object", "properties": {"summary": {"type": "string"}, "description": {"type": "string"}}, "required": ["summary", "description"]}
    sys_p = ("너는 QA 엔지니어다. 네트워크 장비 시험 Fail 결과로 Jira 이슈를 작성한다. "
             "summary는 [모델/버전] 증상 한 줄(80자 이내). description은 Jira wiki 마크업으로 "
             "h3.환경 / h3.재현 절차(실행 CLI 순서) / h3.기대 결과 / h3.실제 결과(출력 인용 {code}...{code}) 구성. "
             "결과에 없는 내용은 추측하지 않는다. JSON {\"summary\":...,\"description\":...} 만 출력한다.")
    issues = []
    for it in fails:
        fctx = (f"모델 {cycle.get('model','')} / 버전 {cycle.get('version','')}\nTC: {it.get('tcid','')} {it.get('name','')}\n메모: {it.get('memo','')}\n[스텝]\n")
        for i, s in enumerate(it.get("steps") or [], 1):
            if not isinstance(s, dict):
                continue
            fctx += f"{i}. {s.get('desc','')} / CLI `{s.get('cli','')}` / 기대({s.get('type','')}): {s.get('criteria','')} / 결과: {s.get('result','')}\n"
            out = str(s.get("output") or "").strip()
            if out and str(s.get("result") or "").strip().upper() in ("FAIL", "불합격"):
                fctx += "   출력:\n" + out[-600:] + "\n"
        content, err = await ai._ai_chat([{"role": "system", "content": sys_p}, {"role": "user", "content": fctx}], max_tokens=1400, json_schema=schema)
        obj = ai._ai_json(content) if content else None
        summary = (obj or {}).get("summary") or f"[{cycle.get('model','')}/{cycle.get('version','')}] {it.get('tcid','')} {it.get('name','')} 시험 Fail"
        desc = (obj or {}).get("description") or ("h3.환경\n" + f"모델 {cycle.get('model','')} / 버전 {cycle.get('version','')}\n\nh3.실패 내역\n" + fctx[:3000])
        desc += f"\n\n----\n자동 등록: utop Cycle {cycle_id}"
        rec = {"tcid": it.get("tcid", ""), "summary": summary}
        if dry:
            rec["description"] = desc
        else:
            res = await jira.jira_create_issue({"project": project, "issuetype": itype, "summary": summary, "description": desc, "labels": ["utop-auto"]})
            rec.update({"ok": bool(res.get("ok")), "key": res.get("key", ""), "url": res.get("url", ""), "error": res.get("error", "")})
        issues.append(rec)
    if not dry:
        cycle = await db.cycle_get(cycle_id)
        cycle.setdefault("auto_jira", []).extend([{"tcid": r["tcid"], "key": r.get("key", ""), "at": datetime.now().strftime("%Y-%m-%d %H:%M")} for r in issues if r.get("ok")])
        await db.cycle_upsert(cycle_id, cycle)
    return {"ok": True, "issues": issues, "dry_run": dry}


@router.get("/api/tc/{tc_id}/cycles")
async def tc_cycles(tc_id: str):
    """이 TC 가 어느 플랜에서 돌았고 결과가 어땠나.

    실행 이력(`/run-history`)과 다른 질문이다. 저쪽은 '이 화면에서 언제
    돌렸나' 고, 이쪽은 '어느 배포 검증에 들어갔나' 다. 자료도 다른 곳에
    있다 — 이력은 파일, 플랜은 DB 의 cycle 테이블이다.
    """
    tc_id = core.tc_id_norm(tc_id)
    rows = await db.cycle_of_tc(tc_id)
    out = []
    for r in rows:
        fail = int(r.get("steps_fail") or 0)
        ok = int(r.get("steps_pass") or 0)
        # 옛 자료에는 item.status 가 없다. 스텝 집계로 만든다 —
        # 하나라도 실패면 FAIL, 하나도 안 돈 것은 미실행이다.
        status = (r.get("status") or "").upper()
        if status not in ("PASS", "FAIL"):
            status = "FAIL" if fail else ("PASS" if ok else "")
        at = r.get("executed_at") or r.get("start_date") or r.get("created_at") or ""
        if not at and r.get("updated_at") is not None:
            at = str(r["updated_at"])
        out.append({
            "cycle_id": r.get("cycle_id") or "",
            "model": r.get("model") or "",
            "version": r.get("version") or "",
            "at": str(at)[:19],
            "by": r.get("executed_by") or "",
            "auto": str(r.get("executed_auto") or "").lower() in ("1", "true", "y", "yes"),
            "device": r.get("device") or "",
            "status": status,
            "pass": ok,
            "fail": fail,
            "steps": int(r.get("steps_count") or 0),
            "issues": int(r.get("issues") or 0),
        })
    return {"ok": True, "cycles": out}




# ══════════════════════════════════════════════════════════════════════
# 플랜 서버 실행
#
# 전에는 브라우저가 실행을 붙들고 있었다. 64건을 걸어 놓고 탭을 닫으면
# 거기서 멈췄고, 자리를 뜰 수가 없었다. 253 을 실행 서버로 둔 의미도
# 여기서 생긴다.
#
# 화면은 **일감을 줄에 걸어 놓고 손을 뗀다.** 실행기(runner 컨테이너)가
# 집어서 돌리고 진행을 여기로 올린다. 서버가 그것을 WebSocket 으로 뿌리면
# 보고 있던 사람들 화면이 같이 움직이고, 안 보고 있었어도 나중에 열어
# 처음부터 다 볼 수 있다.
#
# 판정기는 한 벌이다. 실행기는 화면과 **같은 runner.ts·judge.ts** 를 Node 로
# 묶어 돈다 — 두 벌이면 한 화면에서 적합인 것이 다른 화면에서 부적합이 된다.
# ══════════════════════════════════════════════════════════════════════

# 실행기가 자기를 밝히는 열쇠. 사람의 세션이 없는 자리라 이것으로 가른다.
RUNNER_KEY = os.environ.get("RUNNER_KEY") or ""


def _runner_guard(key: str):
    if not RUNNER_KEY:
        raise HTTPException(503, "RUNNER_KEY 가 정해져 있지 않습니다")
    if str(key or "") != RUNNER_KEY:
        raise HTTPException(403, "실행기 열쇠가 맞지 않습니다")


async def _run_push(run: dict, logs: list = None):
    """진행을 보고 있는 사람들에게 그대로 넘긴다."""
    try:
        msg = {"type": "run_progress", "run": run}
        if logs:
            msg["logs"] = logs
        asyncio.create_task(core.broadcast(msg))
    except Exception:
        pass


@router.post("/api/runs")
async def run_queue(payload: dict, request: Request):
    """실행을 줄에 건다. 돌리는 것은 실행기가 한다."""
    cycle_id = str(payload.get("cycle_id") or "").strip()

    # 실행(plan_run) 으로도 걸 수 있다. 실행기는 플랜만 알고 도니, 여기서
    # **그 실행이 담은 항목만** 자리 번호로 바꿔 준다. 나중에 플랜에 더
    # 담긴 항목이 이미 만든 실행에 끼어들면 안 된다.
    plan_run_id = str(payload.get("plan_run_id") or "").strip()
    prun = await db.plan_run_get(plan_run_id) if plan_run_id else None
    if plan_run_id and not prun:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    if prun and not cycle_id:
        cycle_id = str(prun.get("plan_id") or "").strip()
    if not cycle_id:
        raise HTTPException(400, "cycle_id 가 필요합니다")
    cyc = await db.cycle_get(cycle_id)
    if cyc is None:
        raise HTTPException(404, "플랜을 찾을 수 없습니다")

    # pick 은 **tcid 가 정본**이다(지적: 왔다갔다 실행). 자리번호로 담아 두면
    # 건 뒤에 사이클이 저장(재정렬)될 때 실행기가 스냅샷에 번호를 풀어
    # 엉뚱한 항목이 엉뚱한 차례로 돈다. 옛 화면이 보내는 자리번호는 지금
    # 이 순간의 사이클에 대고 tcid 로 번역해 둔다.
    items = cyc.get("items") if isinstance(cyc.get("items"), list) else []
    tcid_at = [str((it or {}).get("tcid") or "").strip() if isinstance(it, dict) else "" for it in items]
    in_cyc = set(t for t in tcid_at if t)
    picked: list[str] = []
    for x in (payload.get("pick") or []):
        if isinstance(x, bool):
            continue
        if isinstance(x, (int, float)) or (isinstance(x, str) and x.lstrip("-").isdigit()):
            i = int(x)
            if 0 <= i < len(tcid_at) and tcid_at[i]:
                picked.append(tcid_at[i])
        elif isinstance(x, str) and x.strip() in in_cyc:
            picked.append(x.strip())
    if not picked and prun:
        # 안 보냈으면 **실행이 담은 차례**(만들 때의 화면 차례)를 따른다 —
        # 사이클 배열 차례로 세우면 화면과 다른 차례로 돈다.
        mine = set(str(k) for k in (prun.get("results") or {}).keys())
        ordered = [str((it or {}).get("tcid") or "").strip() for it in (prun.get("items") or [])]
        for k in ordered:
            if k and k in in_cyc and (not mine or k in mine):
                picked.append(k)
        for k in sorted(mine):  # 담은 차례에 빠진 결과 키(옛 자료)는 뒤에
            if k in in_cyc and k not in picked:
                picked.append(k)
        if not picked:
            raise HTTPException(400, "이 실행이 담은 항목이 플랜에 없습니다 — 플랜에서 항목이 빠졌는지 보세요")
    if not picked:
        picked = [t for t in tcid_at if t]
    # 같은 항목이 두 번 담기지 않게 — 차례는 처음 것을 지킨다
    seen_p: set[str] = set()
    picked = [t for t in picked if not (t in seen_p or seen_p.add(t))]
    if not picked:
        raise HTTPException(400, "돌릴 항목이 없습니다")

    # 같은 플랜을 둘이 동시에 돌리면 결과를 서로 덮는다. 한 번에 하나만.
    live = await db.run_active(cycle_id)
    if live:
        raise HTTPException(
            409,
            f"이 플랜은 이미 돌고 있습니다 ({live[0].get('started_by') or '누군가'}). "
            "끝나거나 멈춘 뒤에 다시 거세요.",
        )

    # 누가 걸었나. 화면에 「누가 돌리고 있나」 를 보여야 남이 멈추기 전에
    # 한 번 묻게 된다.
    who = ""
    try:
        who = core.user_of(core.token_from(request)) or ""
    except Exception:
        pass
    # **다시 실행해도 지난 회차는 지우지 않는다**(지시: 기본값 0 으로 두고
    # 쌓는 방식). 예전엔 여기서 회차 줄을 지웠다 — 안 지우면 화면에 옛 회차가
    # 방금 시작한 시험과 섞였기 때문(진행 0% 인데 Response 에 지난 83 회차).
    # 이제는 항목마다 **이번 시작 시각(session_at)** 을 적고, 실행 화면은 그 뒤
    # 회차만 1 부터 보인다. 사이클 표·일자별 그림은 쌓인 전부를 센다.
    if plan_run_id:
        try:
            # **지난 판정은 비운다.** results 를 놔두면 Test Report 가 옛 판정을
            # 세어 「65 중 6 진행인데 Pass 62」 가 된다 — 진행은 0 부터.
            cur_run = await db.plan_run_get(plan_run_id)
            if cur_run:
                res = dict(cur_run.get("results") or {})
                vat = dict(cur_run.get("vat") or {})
                logs = dict(cur_run.get("logs") or {})
                sess = dict(cur_run.get("session_at") or {})
                now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
                for k in picked:
                    res[k] = ""
                    vat.pop(k, None)
                    logs.pop(k, None)
                    sess[k] = now_iso
                await db.plan_run_upsert(
                    plan_run_id, {**cur_run, "results": res, "vat": vat, "logs": logs, "session_at": sess}
                )
        except Exception:  # noqa: BLE001
            pass  # 못 지워도 실행은 건다 — 새 결과가 같은 자리를 덮는다

    run_id = _uuid4().hex[:16]
    # **「다시 실행」 은 덮어쓴다**(지시) — 사이클 하나가 한 번의 시험이다.
    # 회차가 쌓이는 것은 **반복 시험뿐**이고, 그것은 실행기가 1 부터 센다.
    # (한때 다시 실행마다 번호를 올렸더니, 반복 1 회로 둔 사이클이 열일곱
    #  회차가 되어 반복 설정과 같은 축으로 읽혔다 — 지적.)
    rnd = 1
    # 반복 시험이면 고른 묶음을 repeat 번 돈다 — 한 바퀴가 한 회차다.
    # 안 보내면 1 이라, 여태처럼 한 바퀴만 돌고 끝난다.
    rep = {
        "repeat_n": payload.get("repeat") or payload.get("repeat_n") or 1,
        "gap_ms": payload.get("gap_ms", 500),
        "on_fail": payload.get("on_fail") or "go",
        "hold_min": payload.get("hold_min") or 180,
        "hold_over": payload.get("hold_over") or "stop",
        "fail_max": payload.get("fail_max") or 0,
    }
    run = await db.run_create(
        run_id, cycle_id, str(cyc.get("name") or ""), picked,
        # 총 개수는 **반복까지 곱한다** — 10 개를 1,000 번 돌면 10,000 이다.
        # 안 곱하면 진행률이 첫 바퀴에서 100% 가 되어 멈춘 것처럼 보인다
        who or str(payload.get("who") or ""),
        len(picked) * max(1, int(rep["repeat_n"] or 1)), plan_run_id, rnd, rep,
    )
    await _run_push(run)
    return {"ok": True, "run": run}


@router.get("/api/runs")
async def run_list(
    cycle_id: str = "", active: int = 0, limit: int = 200,
    status: str = "", who: str = "", q: str = "",
):
    """실행 목록.

    `cycle_id` 가 있으면 그 플랜의 것, 없으면 **전부**. 「어제 밤에 뭐가
    돌았나」 는 플랜을 하나씩 열어서는 못 답한다 — Executions 화면이
    그 자리다.
    """
    if active:
        return {"runs": await db.run_active(cycle_id)}
    if cycle_id:
        return {"runs": await db.run_recent(cycle_id)}
    return {"runs": await db.run_all(limit, status, who, q), "people": await db.run_people()}


@router.get("/api/runs/{run_id}")
async def run_one(run_id: str, after: int = 0):
    """진행 + 지난 로그.

    브라우저를 닫았다 다시 열면 `after=0` 으로 통째로 받아 그대로 다시
    그린다. 이어서 볼 때는 마지막으로 본 seq 를 준다.
    """
    run = await db.run_get(run_id)
    if run is None:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    return {"run": run, "logs": await db.run_log_get(run_id, after)}


@router.post("/api/runs/{run_id}/resume")
async def run_resume_api(run_id: str, payload: dict):
    """멈춰 선 반복 시험에 답한다 — 배너의 세 단추가 부르는 자리.

    go(계속) · skip(이 회차 건너뛰고 계속) · stop(시험 종료). 실행기는
    대기하는 동안 progress 응답에서 이 값을 보고 깨어난다."""
    what = str((payload or {}).get("what") or "").strip().lower()
    if what not in ("go", "skip", "stop"):
        raise HTTPException(400, "go · skip · stop 중 하나여야 합니다")
    run = await db.run_resume(run_id, what)
    if run is None:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    await _run_push(run)
    return {"ok": True, "run": run}


@router.post("/api/runs/{run_id}/stop")
async def run_stop(run_id: str):
    ok = await db.run_stop_ask(run_id)
    run = await db.run_get(run_id)
    if run:
        await _run_push(run)
    return {"ok": ok, "run": run}


# ── 여기부터는 실행기가 부르는 자리 ──────────────────────────────

# ── Cycles 알림 — 시험이 끝나면 실행한 사람에게 결과 메일(지시) ──────────────
def _done_fill(tpl: str, v: dict) -> str:
    out = str(tpl or "")
    for k, x in v.items():
        out = out.replace("{{" + k + "}}", str(x if x is not None else ""))
    return out


def _done_user_email(name_or_id: str) -> str:
    """계정 아이디 또는 이름으로 이메일을 찾는다(배정 알림과 같은 규칙)."""
    key = str(name_or_id or "").strip()
    if not key:
        return ""
    try:
        for x in core.users_load_sync().get("users", []):
            if key in (x.get("username"), x.get("name")) and x.get("email"):
                return str(x["email"])
    except Exception:
        pass
    return ""


def _done_kst(iso: str) -> str:
    """ISO 시각 → 한국 시각 'MM-DD HH:MM'. 비었으면 '-'."""
    try:
        if not iso:
            return "-"
        d = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return d.astimezone(timezone(__import__("datetime").timedelta(hours=9))).strftime("%m-%d %H:%M")
    except Exception:
        return str(iso)[:16]


async def _notify_run_done(run: dict) -> None:
    """일감이 끝났다 — 실행한 사람(started_by)에게 결과 메일.

    메일 설정의 「Cycles 알림」 이 켜져 있을 때만. 담당자에게도·실패가 있을 때만
    스위치를 따른다. 보내다 넘어져도 실행기 응답을 막지 않는다(create_task 로
    돌고 삼킨다). 보낸 자취는 사이클 메일 이력에 「자동」 으로 남긴다."""
    try:
        cfg = core.load_mail_cfg()
        if not cfg.get("enabled") or not cfg.get("done_enabled"):
            return
        cid = str((run or {}).get("cycle_id") or "").strip()
        pid = str((run or {}).get("plan_run_id") or "").strip()
        if not cid:
            return
        cycle = await db.cycle_get(cid) or {}
        prun = (await db.plan_run_get(pid)) if pid else None
        results = dict((prun or {}).get("results") or {})
        items = [it for it in (cycle.get("items") or []) if isinstance(it, dict)]
        by_tcid = {str(it.get("tcid") or ""): it for it in items}
        # 고른 항목 — tcid 목록이거나 차례 번호 목록이다
        picked_raw = (run or {}).get("picked") or []
        picked: list[str] = []
        for x in picked_raw:
            if isinstance(x, int) and 0 <= x < len(items):
                picked.append(str(items[x].get("tcid") or ""))
            else:
                picked.append(str(x))
        picked = [p for p in picked if p] or list(by_tcid.keys())
        hist: dict[str, int] = {}
        for tcid in picked:
            v = str(results.get(tcid) or "")
            hist[v] = hist.get(v, 0) + 1
        groups = await db.verdict_groups()
        st = db._fold_hist(hist, groups)
        fails = [(tcid, str(results.get(tcid) or "")) for tcid in picked
                 if groups.get(str(results.get(tcid) or ""), "neutral") == "fail"]
        status = str((run or {}).get("status") or "done")
        status_ko = {"done": "완료", "stopped": "멈춤", "error": "오류", "failed": "오류"}.get(status, status)
        if cfg.get("done_only_fail") and not fails and status == "done":
            return
        who = str((run or {}).get("started_by") or "").strip()
        to: list[str] = []
        e1 = _done_user_email(who)
        if e1:
            to.append(e1)
        if cfg.get("done_to_assignee"):
            e2 = _done_user_email(str(cycle.get("assignee") or ""))
            if e2 and e2 not in to:
                to.append(e2)
        if not to:
            print(f"[done-mail] 받을 사람이 없습니다 — 실행한 사람 '{who}' 에 이메일이 없음 ({cid})", flush=True)
            return
        esc = lambda x: _h.escape(str(x or ""))  # noqa: E731
        vals = {
            "cycle": cycle.get("name") or cid, "model": cycle.get("model") or "",
            "version": cycle.get("version") or "", "vgroup": cycle.get("version_group") or "",
            "status": status_ko, "who": who, "total": len(picked),
            "pass": st["n_pass"], "fail": st["n_fail"], "etc": st["n_etc"], "none": st["n_none"],
        }
        subject = _done_fill(str(cfg.get("done_subject") or "") or _DONE_SUBJECT, vals)
        secs = cfg.get("done_sections") if isinstance(cfg.get("done_sections"), dict) else {}
        on = lambda k: secs.get(k, True) is not False  # noqa: E731
        app_url = str(cfg.get("app_url") or "").rstrip("/")
        link = f"{app_url}/?cycle={cid}" if app_url else ""
        nl2br = lambda x: esc(x).replace("\n", "<br>")  # noqa: E731
        parts = []
        parts.append(f'<div style="font-size:18px;font-weight:800;color:#0d2b3a;margin-bottom:4px;">{esc(vals["cycle"])}</div>')
        parts.append(f'<div style="font-size:12px;color:#6b7280;margin-bottom:12px;">{esc(vals["model"])} {esc(vals["version"])} · 시험 {esc(status_ko)}</div>')
        if str(cfg.get("done_intro") or "").strip():
            parts.append(f'<p style="margin:0 0 12px;font-size:13px;line-height:1.7;">{nl2br(cfg.get("done_intro"))}</p>')
        if on("summary"):
            row = lambda k, v: f'<tr><th style="text-align:left;padding:5px 10px;border:1px solid #e3e8ef;background:#f5f7fa;color:#6b7280;font-weight:600;white-space:nowrap;">{k}</th><td style="padding:5px 10px;border:1px solid #e3e8ef;">{v}</td></tr>'  # noqa: E731
            parts.append('<table style="border-collapse:collapse;font-size:13px;margin-bottom:12px;">'
                         + row("상태", esc(status_ko)) + row("실행한 사람", esc(who) or "-")
                         + row("시작 · 종료", f'{esc(_done_kst(run.get("started_at")))} ~ {esc(_done_kst(run.get("ended_at")))}')
                         + row("항목", f'{len(picked)}건')
                         + row("판정", f'<b style="color:#1d9e75">Pass {st["n_pass"]}</b> · <b style="color:#c0392b">Fail {st["n_fail"]}</b> · 기타 {st["n_etc"]} · 미판정 {st["n_none"]}')
                         + '</table>')
        if on("fails") and fails:
            parts.append('<div style="font-size:13px;font-weight:800;color:#c0392b;margin-bottom:6px;">실패 항목</div>')
            parts.append('<table style="border-collapse:collapse;font-size:12.5px;margin-bottom:12px;width:100%;">'
                         + "".join(f'<tr><td style="padding:5px 10px;border:1px solid #e3e8ef;font-family:monospace;color:#2563eb;white-space:nowrap;">{esc(tcid)}</td>'
                                   f'<td style="padding:5px 10px;border:1px solid #e3e8ef;">{esc(by_tcid.get(tcid, {}).get("name"))}</td>'
                                   f'<td style="padding:5px 10px;border:1px solid #e3e8ef;color:#c0392b;white-space:nowrap;">{esc(v)}</td></tr>' for tcid, v in fails)
                         + '</table>')
        if on("items"):
            parts.append('<div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:6px;">시험 항목</div>')
            parts.append('<table style="border-collapse:collapse;font-size:12.5px;margin-bottom:12px;width:100%;">'
                         + "".join(f'<tr><td style="padding:4px 10px;border:1px solid #e3e8ef;font-family:monospace;color:#2563eb;white-space:nowrap;">{esc(tcid)}</td>'
                                   f'<td style="padding:4px 10px;border:1px solid #e3e8ef;">{esc(by_tcid.get(tcid, {}).get("name"))}</td>'
                                   f'<td style="padding:4px 10px;border:1px solid #e3e8ef;white-space:nowrap;">{esc(results.get(tcid) or "미판정")}</td></tr>' for tcid in picked)
                         + '</table>')
        if on("link") and link:
            parts.append(f'<a href="{esc(link)}" style="display:inline-block;margin:4px 0 12px;padding:9px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:7px;font-weight:700;">사이클 열기 →</a>')
        if str(cfg.get("done_outro") or "").strip():
            parts.append(f'<p style="margin:0 0 12px;font-size:13px;line-height:1.7;">{nl2br(cfg.get("done_outro"))}</p>')
        parts.append('<div style="margin-top:16px;font-size:11px;color:#9ca3af;border-top:1px solid #eef0f4;padding-top:10px;">ubiQuoss-TOP 시험 자동화 플랫폼에서 시험이 끝나 자동 발송한 메일입니다.</div>')
        html = ('<!DOCTYPE html><html><body style="margin:0;padding:0;background:#eef1f6;">'
                '<div style="max-width:720px;margin:0 auto;padding:24px 16px;">'
                '<div style="background:#fff;border-radius:11px;padding:20px 22px;font-family:\'Malgun Gothic\',Arial,sans-serif;color:#131920;">'
                + "".join(parts) + '</div></div></body></html>')
        joined = ", ".join(to)
        try:
            sent = await asyncio.to_thread(core.send_mail, to, subject, html, True)
            await db.cycle_mail_add(cid, "자동(시험 종료)", ", ".join(sent or to), subject,
                                    "시험 종료 자동 알림", True, "", "", "", html, [])
        except Exception as e:  # noqa: BLE001
            await db.cycle_mail_add(cid, "자동(시험 종료)", joined, subject,
                                    "시험 종료 자동 알림", False, str(e), "", "", html, [])
            print(f"[done-mail] 보내지 못했습니다 ({cid} → {joined}): {e}", flush=True)
    except Exception as e:  # noqa: BLE001
        print(f"[done-mail] 알림 실패: {e}", flush=True)


async def _mirror_plan_run(run: dict) -> None:
    """일감이 실행(plan_run)의 것이면 플랜에 쌓인 결과를 그리로 옮겨 적는다.

    옮기다 넘어져도 **실행은 계속 돌아야 한다** — 옮기기 실패가 시험을
    멈추게 하면 안 된다. 그래서 삼키고 로그만 남긴다.
    """
    pid = str((run or {}).get("plan_run_id") or "").strip()
    cid = str((run or {}).get("cycle_id") or "").strip()
    if not pid or not cid:
        return
    try:
        await db.plan_run_mirror(pid, cid)
    except Exception as e:  # noqa: BLE001
        print(f"[plan_run_mirror] {pid} 옮기기 실패: {e}", flush=True)


@router.post("/api/runner/claim")
async def run_claim(payload: dict):
    _runner_guard(payload.get("key"))
    # 죽은 실행을 먼저 걷어낸다. 안 그러면 running 인 채로 영원히 남아
    # 화면은 계속 도는 줄 알고 기다린다.
    await db.run_sweep_dead()
    run = await db.run_claim(str(payload.get("worker") or "runner"))
    if run:
        await _run_push(run)
    return {"run": run}


@router.post("/api/runner/{run_id}/progress")
async def run_progress(run_id: str, payload: dict):
    _runner_guard(payload.get("key"))
    logs = payload.get("logs") if isinstance(payload.get("logs"), list) else []
    if logs:
        # **seq 를 붙여서** 넘긴다 — 보고 있는 화면이 WebSocket 으로 받은 줄과
        # 나중에 다시 읽은 줄을 seq 로 가른다. 없으면 같은 줄이 두 번 그려진다.
        end = await db.run_log_add(run_id, logs)
        base = end - len(logs)
        for n, x in enumerate(logs):
            if isinstance(x, dict):
                x["seq"] = base + n + 1
    patch = {k: v for k, v in (payload.get("patch") or {}).items()}
    run = await db.run_progress(run_id, patch)
    if run is None:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    # 실행기는 플랜에만 쓴다 — 항목이 하나 끝날 때마다 실행 기록으로 옮긴다.
    # 여기서 안 옮기면 도는 내내 Runs 화면이 0% 인 채로 남는다.
    await _mirror_plan_run(run)
    await _run_push(run, logs)
    # 멈춤을 부탁받았는지 실행기에게 알려준다 — 스텝 사이에서 스스로 내려온다.
    # resume 은 **멈춰 선 반복 시험**에서 사람이 누른 답이다(계속·건너뛰기·종료)
    return {
        "ok": True,
        "stop": bool(run.get("stop_asked")),
        "resume": str(run.get("resume") or ""),
    }


@router.post("/api/runner/{run_id}/finish")
async def run_done(run_id: str, payload: dict):
    _runner_guard(payload.get("key"))
    logs = payload.get("logs") if isinstance(payload.get("logs"), list) else []
    if logs:
        await db.run_log_add(run_id, logs)
    run = await db.run_finish(
        run_id, str(payload.get("status") or "done"), str(payload.get("error") or "")
    )
    if run is None:
        raise HTTPException(404, "실행을 찾을 수 없습니다")
    await _mirror_plan_run(run)
    await _run_push(run, logs)
    # Cycles 알림(지시) — 실행한 사람에게. 뒤에서 돌고, 실행기 응답을 막지 않는다
    try:
        asyncio.create_task(_notify_run_done(run))
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True}


@router.post("/api/runner/login")
async def runner_login(payload: dict):
    """실행기에게 보통 세션을 하나 내준다.

    실행기는 플랜·TC 를 읽고 장비 세션을 열고 결과를 저장한다 — 사람이
    하는 일과 똑같다. 그래서 인증 길을 따로 파지 않고 **평범한 토큰**을
    준다. 그러면 지금 있는 권한 검사가 그대로 적용된다.

    누가 무엇을 했는지는 남아야 하므로 실행기 자신의 이름으로 남긴다.
    """
    _runner_guard(payload.get("key"))
    token = _secrets.token_hex(16)
    core.SESSIONS[token] = {
        "username": "runner",
        "role": "관리자",
        "name": "실행 서버",
        "ts": datetime.now().timestamp(),
    }
    core.save_one_session(token)
    return {"token": token}


# ══════════════════════════════════════════════════════════════════════
# Reports — 집계
#
# 「지금 이 장비 이 버전이 몇 % 왔나 · 어디가 깨졌나」 는 플랜을 하나씩
# 열어서는 못 답한다. 플랜 24건을 화면이 하나씩 읽게 하면 느리기도 하고,
# 무엇보다 같은 셈을 화면마다 다시 짜게 된다.
#
# 여기서 한 번에 세어 내려준다.
# ══════════════════════════════════════════════════════════════════════

@router.get("/api/report/summary")
async def report_summary():
    cycles = await db.cycle_list_meta()
    rows = []
    for c in cycles:
        cid = c.get("id")
        cname = c.get("name") or ""
        model = c.get("model") or ""
        version = c.get("version") or ""
        vg = c.get("version_group") or ""
        customer = str(c.get("customer") or "")
        cstatus = str(c.get("status") or "")
        for it in (c.get("items") or []):
            if not isinstance(it, dict):
                continue
            # 옛 자료(_verdict 가 없는 요약)는 여기서 다시 센다
            v = it.get("_verdict")
            if v is None:
                v = db.item_verdict(it, it.get("steps") or [])
            steps = it.get("steps") or []
            manual = [s for s in steps if isinstance(s, dict) and db.is_manual_step(s)]
            rows.append({
                "cycle_id": cid,
                "cycle": cname or f"{model} {version}".strip(),
                "model": model,
                "version": version,
                "version_group": vg,
                "customer": customer,
                "cycle_status": cstatus,
                "tcid": it.get("tcid") or "",
                "name": it.get("name") or "",
                "req_id": it.get("req_id") or "",
                "severity": it.get("severity") or "",
                "assignee": it.get("assignee") or it.get("executed_by") or "",
                "executed_at": it.get("executed_at") or "",
                "auto": bool(it.get("executed_auto")),
                # 사람이 할 일인가 장비가 할 일인가
                "kind": ("manual" if manual and len(manual) == len(steps)
                         else "mixed" if manual else "auto" if steps else ""),
                "verdict": v or "",
                "steps": len(steps),
                "fail_steps": int(it.get("_steps_fail") or 0),
            })
    return {"rows": rows, "cycles": [
        {"id": c.get("id"), "name": c.get("name"), "model": c.get("model"),
         "version": c.get("version"), "version_group": c.get("version_group")}
        for c in cycles
    ]}
