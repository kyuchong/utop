import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, apiFetch, categoryApi, reqApi, tcApi } from '@/api/client'
import ListHead from '@/components/ListHead'
import ReqTree from '@/components/ReqTree'
import { useMultiSelect } from '@/components/useMultiSelect'
import { IconPanel, IconTcDoc } from '@/components/icons'
import ReqForm from '@/components/ReqForm'
import ReqBulkForm from '@/components/ReqBulkForm'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import TcForm from '@/components/TcForm'
import ReqDetail from '@/components/ReqDetail'
import TcLinkForm from '@/components/TcLinkForm'
import TcBulkForm from '@/components/TcBulkForm'
import {
  reqLabel,
  reqPk,
  statusClass,
  type Requirement,
  type TestCaseMeta,
} from '@/types'
import './Requirements.css'

/**
 * REQ ↔ TC 연결 화면.
 *
 * 연결 관계의 정본은 두 군데에 있다:
 *   - TC 쪽의 req_id  (PG tc.req_id 컬럼, db.py:_tc_meta)
 *   - REQ 쪽의 tc[]   (PG req.data->'tc', main.py:2074 가 참조로 축약)
 * 둘이 어긋난 데이터가 실제로 있을 수 있어 합집합으로 본다.
 * 어느 쪽에만 있는지는 행에 표시해 준다.
 */
/** 새로고침해도 보던 자리로 (TestCases.tsx 와 같은 뜻) */
const SEL_KEY = 'utop.req.sel'
const FOLDER_KEY = 'utop.req.folder'

export default function Requirements() {
  const [selected, setSelected] = useState<string | null>(
    () => localStorage.getItem(SEL_KEY) || null,
  )
  /**
   * 고른 폴더. undefined = 안 고름 · null = 미분류.
   *
   * 요구사항 하나가 아니라 폴더를 고르면 오른쪽에 그 폴더 아래 요구사항의
   * TC 가 전부 모인다. '이 묶음의 시험이 다 됐나' 는 요구사항 한 건이
   * 아니라 묶음 단위로 묻게 된다.
   */
  /** 보기 방식 — 트리 안에 있던 단추를 ⋯ 로 옮겼다 */
  /** 트리에 요구사항을 안 그리므로 축약 ID 규칙은 쓰이지 않는다 */
  const fullId = false
  /**
   * 1열은 **폴더만** 보여 준다.
   *
   * 요구사항은 2열 표에 뜬다(Zephyr 방식). 트리에도 같이 깔면 같은 것이
   * 두 군데 보여 어느 쪽을 눌러야 하는지 매번 생각하게 된다. 굳이 트리에서
   * 보고 싶으면 ⋯ 에서 끌 수 있다.
   */
  const [foldersOnly, setFoldersOnly] = useState(
    () => localStorage.getItem('utop.req.foldersOnly') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('utop.req.foldersOnly', foldersOnly ? '1' : '0')
  }, [foldersOnly])
  /** 폴더 안의 차례 — ID 순. 번호가 이어져야 빠진 것이 눈에 띈다 */
  const sort: 'id' | 'title' = 'id'
  /** 찾는 글자 — 트리 안에 있던 줄을 머리줄로 올렸다 */
  const [treeQ, setTreeQ] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null | undefined>(() => {
    // 'null'(미분류)과 '안 고름'(undefined)을 문자열 하나로 갈라 담는다
    const v = localStorage.getItem(FOLDER_KEY)
    return v === null || v === '' ? undefined : v === '\u0000' ? null : v
  })
  // 여러 건을 골라 한 번에 지우기
  /**
   * 트리에서 고른 줄 — `req:<pk>` · `cat:<id>` 를 한 자루에 담는다.
   *
   * 따로 담으면 Shift 범위가 폴더와 요구사항 사이를 못 건넌다. 화면에
   * 보이는 대로 이어져 있어야 「여기부터 저기까지」 가 맞는다.
   */
  const treeSel = useMultiSelect<string>()
  const picked = treeSel.picked
  /** 고른 폴더. 요구사항과 함께 지울 수 있어야 정리가 한 번에 끝난다. */
  /** 버튼 줄에서 트리에게 보내는 신호 (숫자가 늘면 트리가 반응한다) */
  const [addFolder, setAddFolder] = useState(0)
  // undefined = 폼 닫힘 / null = 새로 만들기 / Requirement = 편집
  const [form, setForm] = useState<Requirement | null | undefined>(undefined)
  /** 붙여넣기로 여러 건 들여오기(Import) */
  const [importOpen, setImportOpen] = useState(false)
  // undefined = 닫힘 / { } = 새 TC(요구사항 미리 연결)
  const [tcForm, setTcForm] = useState<{ reqId: string } | undefined>(undefined)
  const [tcLinkOpen, setTcLinkOpen] = useState(false)
  const [tcBulkOpen, setTcBulkOpen] = useState(false)
  const [tab, setTab] = useState<'info' | 'detail' | 'tc' | 'runs' | 'history'>('info')
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // 패널 폭은 사람마다 선호가 다르다. 드래그로 맞추고 브라우저에 기억시킨다.
  const splitRef = useRef<HTMLDivElement>(null)
  const [catW, setCatW] = useResizableWidth('utop.req.catW3', 230, 150, 460)

  /**
   * 폴더 트리를 폈나. 사이클·TC 화면과 같은 접기다.
   *
   * 접고 펴는 것은 **사람만** 한다. 화면이 알아서 접으면, 줄 하나 누를
   * 때마다 왼쪽이 움직여 눈이 따라다녀야 한다.
   */
  const [treeOpen, setTreeOpen] = useState(
    () => localStorage.getItem('utop.req.treeOpen') !== '0',
  )
  useEffect(() => {
    localStorage.setItem('utop.req.treeOpen', treeOpen ? '1' : '0')
  }, [treeOpen])

  /** List 표에서 체크한 요구사항(PK) — 액션 바의 대상 */
  const [listPick, setListPick] = useState<Set<string>>(new Set())
  const [listBusy, setListBusy] = useState('')

  /** 보기 — list(표로 여럿) · detail(한 건 넓게) */
  const [view, setView] = useState<'list' | 'detail'>(
    () => (localStorage.getItem('utop.req.view') === 'detail' ? 'detail' : 'list'),
  )
  useEffect(() => {
    localStorage.setItem('utop.req.view', view)
  }, [view])

  const qc = useQueryClient()

  useEffect(() => {
    localStorage.setItem(SEL_KEY, selected ?? '')
  }, [selected])

  useEffect(() => {
    localStorage.setItem(
      FOLDER_KEY,
      selectedFolder === undefined ? '' : selectedFolder === null ? '\u0000' : selectedFolder,
    )
  }, [selectedFolder])


  const reqQ = useQuery({
    queryKey: ['req', 'list'],
    queryFn: ({ signal }) => api.listRequirements(signal),
  })
  const tcQ = useQuery({
    queryKey: ['tc', 'list', 'meta'],
    queryFn: ({ signal }) => api.listTestCases(signal),
  })

  const allReqs = reqQ.data?.reqs ?? []
  const tcs = tcQ.data?.tcs ?? []

  /** req_id → TC[] (TC 쪽 포인터 기준) */
  const tcsByReq = useMemo(() => {
    const m = new Map<string, TestCaseMeta[]>()
    for (const t of tcs) {
      const k = (t.req_id || '').trim()
      if (!k) continue
      const arr = m.get(k)
      if (arr) arr.push(t)
      else m.set(k, [t])
    }
    return m
  }, [tcs])

  /**
   * 이 요구사항을 가리키는 TC 들.
   *
   * tc.req_id 에 무엇이 들어 있는지가 데이터마다 다르다 —
   * 예전 데이터는 PK 와 reqid 가 같은 값이었지만(REQ-001), 새로 만든
   * 요구사항은 PK 가 rq-<ts> 라서 둘이 갈린다. 어느 쪽으로 저장됐든
   * 놓치지 않도록 둘 다로 찾아 합친다.
   */
  const tcsFor = useMemo(
    () => (r: Requirement): TestCaseMeta[] => {
      const a = tcsByReq.get(reqPk(r)) ?? []
      const label = reqLabel(r)
      const b = label && label !== reqPk(r) ? (tcsByReq.get(label) ?? []) : []
      if (b.length === 0) return a
      const seen = new Set(a.map((t) => t.tcid))
      return [...a, ...b.filter((t) => !seen.has(t.tcid))]
    },
    [tcsByReq],
  )

  const tcById = useMemo(() => {
    const m = new Map<string, TestCaseMeta>()
    for (const t of tcs) m.set(t.tcid, t)
    return m
  }, [tcs])

  const selectedReq: Requirement | undefined = useMemo(
    () => allReqs.find((r) => reqPk(r) === selected),
    [allReqs, selected],
  )

  const catQ = useQuery({
    queryKey: ['req-categories'],
    queryFn: ({ signal }) => categoryApi.list(signal),
  })

  /** 폴더 모드 — 요구사항 한 건이 아니라 묶음을 보고 있다 */
  const folderMode = selectedFolder !== undefined

  /** 1열 머리줄에 적을 수 — 이제 이 칸의 주인은 폴더다 */
  const folderCount = (catQ.data?.categories ?? []).length

  const folderName = useMemo(() => {
    if (selectedFolder === undefined) return ''
    if (selectedFolder === null) return '미분류'
    return (catQ.data?.categories ?? []).find((c) => c.id === selectedFolder)?.name ?? '(없는 폴더)'
  }, [selectedFolder, catQ.data])

  /**
   * 이 폴더에 속한 요구사항 — 하위 폴더까지.
   *
   * 요구사항은 cat1~cat4 에 자기가 놓인 폴더의 **조상 사슬 전체**를 들고
   * 있다(ReqTree 의 moveReqM 이 그렇게 채운다). 그래서 넷 중 하나만
   * 맞으면 그 폴더의 자손이다 — 분류 트리를 따로 훑을 필요가 없다.
   */
  const folderReqs = useMemo(() => {
    if (selectedFolder === undefined) return []
    if (selectedFolder === null)
      return allReqs.filter((r) => !r.cat1 && !r.cat2 && !r.cat3 && !r.cat4)
    return allReqs.filter(
      (r) =>
        r.cat1 === selectedFolder ||
        r.cat2 === selectedFolder ||
        r.cat3 === selectedFolder ||
        r.cat4 === selectedFolder,
    )
  }, [allReqs, selectedFolder])

  /** 이 요구사항을 덮는 TC 수 — tc.req_id 와 req.tc[] 참조의 합집합 */
  const covCount = useMemo(
    () => (r: Requirement): number => {
      const ids = new Set(tcsFor(r).map((t) => t.tcid))
      for (const ref of r.tc ?? []) if (ref?.tcid) ids.add(ref.tcid)
      return ids.size
    },
    [tcsFor],
  )

  /** List 모드 표에 뿌릴 — 이 폴더의 요구사항을 정렬해 둔 것 */
  const sortedFolderReqs = useMemo(() => {
    const arr = [...folderReqs]
    arr.sort((a, b) =>
      (reqLabel(a) || '').localeCompare(reqLabel(b) || '', 'ko', { numeric: true }),
    )
    return arr
  }, [folderReqs])

  /** TC 표가 폴더 묶음을 보여 주는 중인가 — 그때만 「요구사항」 열이 뜬다 */
  const tcByFolder = !selectedReq && folderMode

  /** Detail 가운데 목록 — 보고 있는 폴더의 형제 요구사항들 */
  const midReqs = useMemo(
    () => (folderMode ? sortedFolderReqs : selectedReq ? [selectedReq] : []),
    [folderMode, sortedFolderReqs, selectedReq],
  )

  /** 선택된 REQ 에 연결된 TC — 양쪽 정본의 합집합 */
  /**
   * 연결 해제. tc.req_id 를 비우는 것이 전부다 — TC 자체는 남는다.
   * 붙이는 창이 아니라 이 목록에서 한다(Zephyr 도 같은 구조다).
   */
  const unlinkM = useMutation({
    mutationFn: (t: TestCaseMeta) =>
      tcApi.save(t.tcid, {
        tcid: t.tcid,
        name: t.name ?? '',
        type: t.type ?? '',
        status: t.status ?? '',
        severity: t.severity ?? '',
        req_id: '',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
    },
  })

  /**
   * 보고 있는 대상의 TC.
   *
   * 요구사항 하나를 골랐으면 그 하나, 폴더를 골랐으면 그 아래 요구사항
   * 전부를 모은다. 같은 TC 가 여러 요구사항에 걸려 있어도 한 줄만 나온다.
   * ownerOf 는 그 줄이 어느 요구사항의 것인지 — 폴더 모드에서만 쓴다.
   */
  const { linked, ownerOf } = useMemo(() => {
    // 요구사항을 고른 상태면 그 한 건이 먼저다. 폴더가 아직 골라져 있어도
    // (Detail 의 가운데 목록이 쓰라고 남겨 둔 것이라) 그 폴더 전체를 모으면
    // 엉뚱하게 형제들 TC 까지 딸려 온다.
    const targets = selectedReq ? [selectedReq] : folderMode ? folderReqs : []
    const out: TestCaseMeta[] = []
    const owner = new Map<string, Requirement>()
    const seen = new Set<string>()

    for (const r of targets) {
      const push = (t: TestCaseMeta) => {
        if (seen.has(t.tcid)) return
        seen.add(t.tcid)
        owner.set(t.tcid, r)
        out.push(t)
      }
      for (const t of tcsFor(r)) push(t)
      for (const ref of r.tc ?? []) {
        if (!ref?.tcid) continue
        // TC 목록에 있으면 그 메타를, 없으면 REQ 가 들고 있는 참조만으로 행을 만든다.
        push(tcById.get(ref.tcid) ?? { tcid: ref.tcid, name: ref.name, status: ref.status })
      }
    }
    return { linked: out, ownerOf: owner }
  }, [folderMode, folderReqs, selectedReq, tcsFor, tcById])

  /** 커버리지 집계. Xray 처럼 '덮였는가' 를 먼저 답하려고 쓴다. */
  const cov = useMemo(() => {
    let p = 0
    let f = 0
    for (const t of linked) {
      const c = statusClass(t.status)
      if (c === 'pass') p++
      else if (c === 'fail') f++
    }
    return { pass: p, fail: f, idle: linked.length - p - f }
  }, [linked])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return linked.filter((t) => {
      if (statusFilter && statusClass(t.status) !== statusFilter) return false
      if (!needle) return true
      return (
        t.tcid.toLowerCase().includes(needle) ||
        (t.name ?? '').toLowerCase().includes(needle)
      )
    })
  }, [linked, q, statusFilter])


  const loading = reqQ.isLoading || tcQ.isLoading
  const error = reqQ.error ?? tcQ.error

  /**
   * 한 건을 넓게 본다.
   *
   * 폴더 트리는 **건드리지 않는다.** 전에는 여기서 접었는데, 줄 하나 누를
   * 때마다 왼쪽이 접혔다 펴졌다 해서 화면이 튀고 지금 어느 폴더에 있는지
   * 감각을 잃었다. 트리는 230px 이라 셋을 펴 둬도 상세가 넉넉하다 —
   * 좁으면 사람이 접기 단추로 접으면 된다.
   */
  const goDetail = (pk: string, to: typeof tab = 'info') => {
    setSelected(pk)
    setTab(to)
    setView('detail')
  }

  /** 표로 돌아온다 */
  const goList = () => setView('list')

  // ── List 액션 바 ────────────────────────────────────────────
  const pickedInList = sortedFolderReqs.filter((r) => listPick.has(reqPk(r)))
  const allListPicked = sortedFolderReqs.length > 0 && pickedInList.length === sortedFolderReqs.length

  const toggleAllList = () =>
    setListPick(allListPicked ? new Set() : new Set(sortedFolderReqs.map(reqPk)))

  const togglePick = (pk: string) =>
    setListPick((s) => {
      const n = new Set(s)
      if (n.has(pk)) n.delete(pk)
      else n.add(pk)
      return n
    })

  /** 고른 것을 이 폴더에 복제한다 — ID 는 서버가 새로 매긴다 */
  const clonePicked = async () => {
    if (!pickedInList.length) return
    if (!window.confirm(`고른 ${pickedInList.length}건을 복제합니다.`)) return
    setListBusy('clone')
    try {
      for (const r of pickedInList) {
        const nres = await apiFetch('/api/req-next-id')
        const nid = ((await nres.json()) as { reqid?: string }).reqid ?? ''
        const pk = `rq-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
        const { id: _id, reqid: _rid, tc: _tc, ...rest } = r as Record<string, unknown>
        await apiFetch(`/api/req/${encodeURIComponent(pk)}`, {
          method: 'POST',
          body: JSON.stringify({
            ...rest,
            id: pk,
            reqid: nid,
            title: `${r.title ?? ''} (복사)`,
            tc: [],
          }),
        })
      }
      setListPick(new Set())
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['reqs'] })
    } catch (e) {
      window.alert(`복제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setListBusy('')
    }
  }

  /** 고른 것을 지운다 */
  const deletePicked = async () => {
    if (!pickedInList.length) return
    if (
      !window.confirm(
        `고른 요구사항 ${pickedInList.length}건을 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?`,
      )
    )
      return
    setListBusy('del')
    try {
      for (const r of pickedInList) await reqApi.remove(reqPk(r))
      setListPick(new Set())
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
    } catch (e) {
      window.alert(`삭제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setListBusy('')
    }
  }

  /** 보고 있는 표를 CSV 로 — 고른 것이 있으면 그것만 */
  const exportList = () => {
    const rows = pickedInList.length ? pickedInList : sortedFolderReqs
    if (!rows.length) return
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['Requirement ID', 'Name', 'Coverage', 'Priority', 'Status'].map(esc).join(','),
      ...rows.map((r) =>
        [
          reqLabel(r),
          r.title ?? '',
          covCount(r) > 0 ? `${covCount(r)} Testcase(s) Covered` : 'Not Covered',
          r.priority ?? '',
          r.status ?? '',
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\r\n')
    // 엑셀이 한글을 깨뜨리지 않게 BOM 을 붙인다
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `요구사항_${folderName || '전체'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <>
      {form !== undefined && (
        <ReqForm
          editing={form}
          // 1열에서 열어 둔 폴더에 넣는다 — 대·중·소분류가 그 사슬로 채워진다
          presetFolder={selectedFolder ?? null}
          onClose={() => setForm(undefined)}
        />
      )}
      {importOpen && (
        <ReqBulkForm presetFolder={selectedFolder ?? null} onClose={() => setImportOpen(false)} />
      )}

      {tcForm !== undefined && (
        <TcForm
          editing={null}
          presetReqId={tcForm.reqId}
          onClose={() => setTcForm(undefined)}
        />
      )}
      {tcLinkOpen && selectedReq && (
        <TcLinkForm
          req={selectedReq}
          linked={linked}
          onClose={() => setTcLinkOpen(false)}
        />
      )}
      {tcBulkOpen && selectedReq && (
        <TcBulkForm
          presetReqId={reqPk(selectedReq)}
          onClose={() => setTcBulkOpen(false)}
        />
      )}

      {error ? (
        <div className="load-error">
          데이터를 불러오지 못했습니다 — {(error as Error).message}
        </div>
      ) : null}

      {/* ── 맨 위 줄 — 지금 어디를 보고 있나 + 보기 방식 ────────────
          트리·표 위 전체 폭에 걸친다(Zephyr 와 같은 자리). 늘 떠 있다 —
          모드에 따라 사라지면 「내가 어디 있더라」 를 화면에서 못 읽는다. */}
      <div className="rq-bar">
        <span className="rq-crumb">
          <span className="muted">요구사항</span>
          {folderMode && (
            <>
              <span className="rq-crumb-sep">›</span>
              <b>{folderName}</b>
            </>
          )}
          {view === 'detail' && selectedReq && (
            <>
              <span className="rq-crumb-sep">›</span>
              <b>{selectedReq.title || reqLabel(selectedReq) || '(제목 없음)'}</b>
            </>
          )}
          <span className="muted small">
            {view === 'detail' && selectedReq
              ? reqLabel(selectedReq)
              : folderMode
                ? `${folderReqs.length}건 · 하위 폴더 포함`
                : '폴더를 고르세요'}
          </span>
        </span>
        <span className="sp" />
        {/* List(표로 여럿) ↔ Detail(한 건 넓게). Detail 로 가면 폴더가
            자동으로 접힌다 — 셋을 다 펴면 정작 상세가 좁아진다. */}
        <div className="rq-view" role="tablist" aria-label="보기 방식">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'detail'}
            className={`rq-view-b${view === 'detail' ? ' on' : ''}`}
            disabled={!selectedReq}
            title={selectedReq ? '한 건을 넓게 봅니다' : '먼저 요구사항을 고르세요'}
            onClick={() => selectedReq && goDetail(reqPk(selectedReq), tab)}
          >
            Detail
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'list'}
            className={`rq-view-b${view === 'list' ? ' on' : ''}`}
            disabled={!folderMode}
            title={folderMode ? '이 폴더의 요구사항을 표로 봅니다' : '먼저 폴더를 고르세요'}
            onClick={goList}
          >
            List
          </button>
        </div>
      </div>

      <div className="split" ref={splitRef}>
        {/* 접었을 때 — 세로 띠 하나만 남는다. 사이클·TC 화면과 같은 모양.
            아주 없애면 다시 펼 길이 없어지고 어디 있었는지도 잊는다. */}
        {!treeOpen && (
          <button
            type="button"
            className="tc-fold"
            title="폴더 펼치기"
            onClick={() => setTreeOpen(true)}
          >
            <IconPanel open />
            <span className="tc-fold-t">폴더 {allReqs.length}</span>
          </button>
        )}
        {/* ── 왼쪽: 폴더 + 요구사항 한 트리 ─────────────────
            전에는 분류 트리와 요구사항 목록이 따로였다. 자료가 29건 ·
            분류 20개라 전체가 한 화면에 들어오는데 두 단계로 고르게 하고
            있었다. Zephyr Enterprise 처럼 폴더 안에 요구사항을 둔다. */}
        {treeOpen && (
        <section className="panel req-tree-panel" style={{ flexBasis: catW }}>
          {/* 한 줄에 다 넣는다. 건수를 따로 아래에 두면 그만큼 목록이 준다. */}
          {/* 1열은 폴더만 다룬다 — 요구사항을 만들고 고치고 지우는 일은
              전부 2열 표(Add·Clone·Delete·Export)가 맡는다. 두 군데에
              같은 일이 있으면 어디를 눌러야 할지 매번 생각하게 된다. */}
          <ListHead
            name="폴더"
            count={folderCount}
            onCollapse={() => setTreeOpen(false)}
            search={{
              value: treeQ,
              placeholder: '폴더 이름으로 찾기',
              onChange: setTreeQ,
            }}
            add={{ title: '최상위 폴더 추가', onClick: () => setAddFolder((n) => n + 1) }}
            menu={
              <>
                <button type="button" onClick={() => setAddFolder((n) => n + 1)}>
                  최상위 폴더 추가
                </button>
                <p className="lh-hint">
                  하위 폴더 추가 · 이름 바꾸기 · 삭제는 폴더를 우클릭하세요.
                </p>
                <hr />
                <button type="button" onClick={() => setFoldersOnly((v) => !v)}>
                  {foldersOnly ? '✓ ' : ''}폴더만 보기
                </button>
                <hr />
                <button
                  type="button"
                  onClick={() => {
                    void catQ.refetch()
                    void reqQ.refetch()
                  }}
                >
                  다시 읽기
                </button>
              </>
            }
          />
          {loading ? (
            <div className="empty">불러오는 중…</div>
          ) : (
            <ReqTree
              reqs={allReqs}
              tcsFor={tcsFor}
              selected={selected}
              // 요구사항과 폴더는 둘 중 하나만 골라져 있다. 오른쪽 패널이
              // 무엇을 보여줄지가 여기서 갈리므로 서로를 지운다.
              onSelect={(pk) => {
                // 트리에서 요구사항을 고르면 그 한 건을 보는 것이다 → Detail.
                // 폴더는 지우지 않는다(가운데 목록이 형제를 보여 줘야 한다).
                setSelected(pk)
                setView('detail')
                setTab('info')
              }}
              view={{ fullId, foldersOnly }}
              q={treeQ}
              selectedFolder={selectedFolder}
              onSelectFolder={(id) => {
                // 폴더를 열면 그 안 요구사항을 표로 훑는 것이다 → List
                setSelectedFolder(id)
                setSelected(null)
                setView('list')
              }}
              picked={picked}
              onRowClick={treeSel.onClick}
              sort={sort}
              addFolderSignal={addFolder}
            />
          )}
        </section>
        )}

        {treeOpen && (
          <Resizer
            label="요구사항 트리 폭 조절"
            onResize={setCatW}
            getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
          />
        )}


        {/* ── 가운데: Detail 일 때만 — 형제 요구사항을 좁게 ──────
            어느 하나를 읽다가 옆 것으로 넘어가는 일이 잦다. 이 목록이
            없으면 그때마다 List 로 돌아갔다 다시 들어와야 한다. */}
        {view === 'detail' && selectedReq && midReqs.length > 1 && (
          <section className="panel rq-mid">
            <div className="rq-mid-h">
              {folderMode ? folderName : '요구사항'} · {midReqs.length}
            </div>
            <div className="rq-mid-list scroll">
              {midReqs.map((r) => {
                const pk = reqPk(r)
                return (
                  <button
                    key={pk}
                    type="button"
                    className={`rq-mid-row${pk === selected ? ' on' : ''}`}
                    title={r.title || pk}
                    onClick={() => {
                      setSelected(pk)
                      setTab('info')
                    }}
                  >
                    <span className="rq-mid-id">{reqLabel(r) || '–'}</span>
                    <span className="rq-mid-t">{r.title || '(제목 없음)'}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* ── 오른쪽: 탭에 따라 내용이 바뀐다 ─────────────── */}
        <section className="panel tc-panel">
          <div className="panel-title">
            {/* 폴더를 보고 있을 때는 탭을 띄우지 않는다. REQ Info·Details·
                이력은 요구사항 한 건에만 있는 것이라, 폴더에 걸어두면 늘
                비어 있는 탭이 넷 생긴다. 폴더에서는 TC 목록 하나면 된다. */}
            {view === 'list' && folderMode ? (
              /* 표에 대한 일 — 표 바로 위 이 줄에 둔다. 고른 것이 있어야
                 되는 것(Clone·Delete)은 그때만 켜진다. */
              <div className="rq-actions">
                <button className="btn" type="button" onClick={() => setForm(null)}>
                  Add
                </button>
                <button
                  className="btn"
                  type="button"
                  title="엑셀·문서에서 붙여넣어 여러 건을 한 번에 들여옵니다"
                  onClick={() => setImportOpen(true)}
                >
                  Import
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!pickedInList.length || !!listBusy}
                  onClick={() => void clonePicked()}
                >
                  {listBusy === 'clone' ? '복제 중…' : 'Clone'}
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={!pickedInList.length || !!listBusy}
                  onClick={() => void deletePicked()}
                >
                  {listBusy === 'del' ? '삭제 중…' : 'Delete'}
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!sortedFolderReqs.length}
                  onClick={exportList}
                  title={pickedInList.length ? '고른 것만 내보냅니다' : '이 폴더 전체를 내보냅니다'}
                >
                  Export
                </button>
              </div>
            ) : (
            <div className="seg" role="tablist">
              {([
                ['info', 'REQ Info'],
                ['detail', 'REQ Details'],
                ['tc', 'Coverages'],
                ['runs', 'Execution History'],
                ['history', 'Change History'],
              ] as const).map(([k, label]) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  className={`seg-btn${tab === k ? ' on' : ''}`}
                  type="button"
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            )}
            {tab === 'tc' && selectedReq && (
              <div className="page-head-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() => setTcLinkOpen(true)}
                  title="이미 있는 TC 를 이 요구사항에 붙입니다"
                >
                  TC 연결
                </button>
                <button
                  className="btn"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() => setTcBulkOpen(true)}
                >
                  일괄 생성
                </button>
                <button
                  className="btn primary"
                  type="button"
                  disabled={!selectedReq}
                  onClick={() =>
                    // 새 TC 를 만들되 이 요구사항에 미리 연결해 둔다.
                    selectedReq && setTcForm({ reqId: reqPk(selectedReq) })
                  }
                >
                  + TC 생성
                </button>
              </div>
            )}
          </div>

          {!selectedReq && !folderMode ? (
            <div className="empty">왼쪽에서 폴더나 요구사항을 선택하세요.</div>
          ) : view === 'list' && folderMode ? (
            /* ── List 모드 — 이 폴더의 요구사항을 표로 (Zephyr 방식) ──
               한 줄을 누르면 그 요구사항 상세로 들어간다(Detail). */
            <div className="rq-list scroll">
              {/* 몇 개 골랐나 — 표 위에 늘 보여야 지운 뒤 「몇 개였지」 를 안 묻는다 */}
              <div className="rq-selbar">
                <label className="rq-selall">
                  <input
                    type="checkbox"
                    checked={allListPicked}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = pickedInList.length > 0 && !allListPicked
                    }}
                    disabled={!sortedFolderReqs.length}
                    onChange={toggleAllList}
                  />
                  Select All
                </label>
                <span className="rq-seldiv" aria-hidden="true" />
                <span className="muted small">Selected : {pickedInList.length}</span>
              </div>

              <div className="rq-table">
                <div className="rq-tr rq-th">
                  <div />
                  <div>Requirement ID</div>
                  <div>Name</div>
                  <div>Map Test Case</div>
                  <div>Coverage</div>
                  <div>Priority</div>
                </div>
                {folderReqs.length === 0 ? (
                  <div className="empty">이 폴더에 요구사항이 없습니다.</div>
                ) : (
                  sortedFolderReqs.map((r) => {
                    const n = covCount(r)
                    const pk = reqPk(r)
                    return (
                      <div className={`rq-tr${listPick.has(pk) ? ' picked' : ''}`} key={pk}>
                        <div className="rq-ck">
                          <input
                            type="checkbox"
                            checked={listPick.has(pk)}
                            aria-label={`${r.title || pk} 고르기`}
                            onChange={() => togglePick(pk)}
                          />
                        </div>
                        <div className="rq-id" title={reqLabel(r)}>
                          {reqLabel(r) || '–'}
                        </div>
                        <div className="rq-name">
                          {/* 폴더는 그대로 둔다 — Detail 의 가운데 목록이
                              이 폴더의 형제들을 보여 줘야 하니까. */}
                          <button
                            type="button"
                            className="linkish"
                            title="상세 보기"
                            onClick={() => goDetail(pk, 'info')}
                          >
                            {r.title || '(제목 없음)'}
                          </button>
                        </div>
                        <div>
                          <button
                            type="button"
                            className="linkish"
                            title="이 요구사항의 시험(커버리지) 보기"
                            onClick={() => goDetail(pk, 'tc')}
                          >
                            Map
                          </button>
                        </div>
                        <div className={`rq-cov ${n > 0 ? 'covered' : 'none'}`}>
                          {n > 0 ? `${n} Testcase(s) Covered` : 'Not Covered'}
                        </div>
                        <div>
                          {r.priority ? (
                            <span className={`rq-prio p-${String(r.priority).toLowerCase()}`}>
                              {r.priority}
                            </span>
                          ) : (
                            <span className="muted">–</span>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
              <div className="bottom">
                <span>요구사항 {folderReqs.length}건</span>
              </div>
            </div>
          ) : selectedReq && tab !== 'tc' ? (
            <ReqDetail req={selectedReq} tcs={linked} tab={tab} />
          ) : (
            <div className="tc-body scroll">
              {/* 커버리지 상태. 목록만 있으면 '이 요구사항이 덮였나' 를
                  눈으로 세어야 한다. 한 줄로 먼저 답한다. */}
              <div className={`cov-bar ${linked.length === 0 ? 'none' : cov.fail > 0 ? 'bad' : cov.idle > 0 ? 'warn' : 'good'}`}>
                {linked.length === 0 ? (
                  <>
                    <b>미커버</b>
                    <span className="muted small">
                      {tcByFolder
                        ? folderReqs.length === 0
                          ? '이 폴더에 요구사항이 없습니다.'
                          : `요구사항 ${folderReqs.length}건 중 TC 가 붙은 것이 없습니다.`
                        : '이 요구사항을 검증하는 TC 가 없습니다. 「TC 연결」 또는 「+ TC 생성」'}
                    </span>
                  </>
                ) : (
                  <>
                    <b>{cov.fail > 0 ? '실패 있음' : cov.idle > 0 ? '미실행 있음' : '커버됨'}</b>
                    <span className="muted small">
                      TC {linked.length}건 · PASS {cov.pass} · FAIL {cov.fail} · 미실행 {cov.idle}
                    </span>
                  </>
                )}
              </div>

              <div className="filter">
                <input
                  placeholder="TC ID / 제목 검색"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">전체 상태</option>
                  <option value="pass">PASS</option>
                  <option value="fail">FAIL</option>
                  <option value="idle">미실행</option>
                  <option value="draft">작성중</option>
                </select>
              </div>

              <div className="table">
                <div className="tr th">
                  <div>Test Case</div>
                  {/* 폴더는 요구사항 여럿을 모아 보이므로 어느 것의 TC 인지
                      적어야 한다. 한 건만 볼 때는 자명해서 열을 안 만든다. */}
                  {tcByFolder && <div>요구사항</div>}
                  <div>유형</div>
                  <div>Step</div>
                  <div>상태</div>
                  <div />
                </div>
                {shown.length === 0 ? (
                  <div className="empty">
                    {linked.length === 0
                      ? '연결된 TC가 없습니다.'
                      : '조건에 맞는 TC가 없습니다.'}
                  </div>
                ) : (
                  shown.map((t) => {
                    const owner = ownerOf.get(t.tcid)
                    return (
                    <div className="tr" key={t.tcid}>
                      <div className="tc-cell">
                        {/* 읽는 것은 제목이다. ID 는 참조 번호라 뒤에 작게 */}
                        <span className="rt-dicon" aria-hidden="true">
                          <IconTcDoc />
                        </span>
                        {/* ID 는 안 적는다. 이 표는 「이 요구사항이 무엇으로
                            덮여 있나」 를 보는 자리고, 그때 필요한 것은
                            이름이다. ID 는 눌러 들어가면 나온다. */}
                        <div className="tc-name" title={t.tcid}>
                          {t.name || '(제목 없음)'}
                        </div>
                      </div>
                      {tcByFolder && (
                        <div className="fold-req">
                          <button
                            type="button"
                            className="linkish"
                            disabled={!owner}
                            title="이 요구사항으로 이동"
                            onClick={() => {
                              if (!owner) return
                              setSelected(reqPk(owner))
                              setSelectedFolder(undefined)
                            }}
                          >
                            {owner ? reqLabel(owner) || owner.title || '(ID 없음)' : '–'}
                          </button>
                        </div>
                      )}
                      <div>
                        {t.type ? <span className="tag">{t.type}</span> : null}
                      </div>
                      <div className="muted small">{t._cli_count ?? '-'}</div>
                      <div className={`status ${statusClass(t.status)}`}>
                        ● {t.status || '미실행'}
                      </div>
                      {/* 떼는 것은 붙이는 창이 아니라 이 목록에서 한다.
                          한 창에서 붙이기·떼기를 같이 하면 무엇이 무엇인지
                          계속 생각해야 한다(Zephyr 도 같은 구조다). */}
                      <div>
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={unlinkM.isPending}
                          title="이 요구사항에서 뗍니다. TC 자체는 지워지지 않습니다"
                          onClick={() => {
                            if (window.confirm(`'${t.name || t.tcid}' 을 이 요구사항에서 뗍니다.`))
                              unlinkM.mutate(t)
                          }}
                        >
                          해제
                        </button>
                      </div>
                    </div>
                    )
                  })
                )}
              </div>

              <div className="bottom">
                <span>
                  {tcByFolder
                    ? `요구사항 ${folderReqs.length}건 · TC ${linked.length}건`
                    : `${linked.length}개 TC 연결`}
                  {shown.length !== linked.length && ` · ${shown.length}개 표시`}
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
