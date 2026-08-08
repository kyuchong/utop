import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, categoryApi, reqApi, tcApi } from '@/api/client'
import ListHead from '@/components/ListHead'
import ReqTree from '@/components/ReqTree'
import { useMultiSelect } from '@/components/useMultiSelect'
import { IconTcDoc } from '@/components/icons'
import ReqForm from '@/components/ReqForm'
import Resizer, { useResizableWidth } from '@/components/Resizer'
import ReqBulkEdit from '@/components/ReqBulkEdit'
import ReqBulkForm from '@/components/ReqBulkForm'
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
  const [fullId, setFullId] = useState(false)
  const [foldersOnly, setFoldersOnly] = useState(false)
  /** 폴더 안의 차례 — ID 순이 기본. 번호가 이어져야 빠진 것이 눈에 띈다 */
  const [sort, setSort] = useState<'id' | 'title'>('id')
  /** 찾는 글자 — 트리 안에 있던 줄을 머리줄로 올렸다 */
  const [treeQ, setTreeQ] = useState('')
  const [bulkEditOpen, setBulkEditOpen] = useState(false)
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
  const pickedReqs = [...picked].filter((x) => x.startsWith('req:')).map((x) => x.slice(4))
  const pickedCats: string[] = []
  /** 고른 폴더. 요구사항과 함께 지울 수 있어야 정리가 한 번에 끝난다. */
  /** 버튼 줄에서 트리에게 보내는 신호 (숫자가 늘면 트리가 반응한다) */
  const [addFolder, setAddFolder] = useState(0)
  // undefined = 폼 닫힘 / null = 새로 만들기 / Requirement = 편집
  const [form, setForm] = useState<Requirement | null | undefined>(undefined)
  const [bulkOpen, setBulkOpen] = useState(false)
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

  const removeManyM = useMutation({
    mutationFn: async ({ reqIds, folderIds }: { reqIds: string[]; folderIds: string[] }) => {
      // 순차 삭제. 한꺼번에 던지면 어디까지 지워졌는지 알 수 없어
      // 실패했을 때 무엇을 다시 시도해야 하는지 말해줄 수 없다.
      let ok = 0
      for (const id of reqIds) {
        await reqApi.remove(id)
        ok++
      }
      // 폴더는 나중에. 요구사항을 먼저 지워야 '안에 든 것' 셈이 맞는다.
      // 조상을 지우면 자손은 CASCADE 로 함께 사라져 404 가 날 수 있어 넘긴다.
      for (const id of folderIds) {
        try {
          await categoryApi.remove(id)
          ok++
        } catch (e) {
          if (!(e instanceof Error) || !e.message.includes('찾을 수 없')) throw e
        }
      }
      return ok
    },
    onError: (e) => {
      // 조용히 실패하면 「눌러도 안 된다」 로만 남는다
      window.alert(`삭제하지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`)
    },
    onSuccess: () => {
      treeSel.clear()
      void qc.invalidateQueries({ queryKey: ['req', 'list'] })
      void qc.invalidateQueries({ queryKey: ['req-categories'] })
      void qc.invalidateQueries({ queryKey: ['tc', 'list', 'meta'] })
    },
  })

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
    const targets = folderMode ? folderReqs : selectedReq ? [selectedReq] : []
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

  const doRemovePicked = () => {
    const ids = pickedReqs
    const folderIds = pickedCats
    if (ids.length === 0 && folderIds.length === 0) return
    const tcCount = ids.reduce((a, id) => {
      const r = allReqs.find((x) => reqPk(x) === id)
      return a + (r ? tcsFor(r).length : 0)
    }, 0)
    const lines: string[] = []
    if (ids.length > 0) lines.push(`요구사항 ${ids.length}건을 삭제합니다.`)
    if (folderIds.length > 0)
      lines.push(
        `폴더 ${folderIds.length}개를 삭제합니다. 안에 있던 요구사항은 지워지지 않고 미분류가 됩니다.`,
      )
    if (tcCount > 0) lines.push(`연결된 TC ${tcCount}건도 함께 사라집니다.`)
    lines.push('되돌릴 수 없습니다. 계속할까요?')
    if (!window.confirm(lines.join('\n'))) return
    removeManyM.mutate({ reqIds: ids, folderIds })
  }

  const loading = reqQ.isLoading || tcQ.isLoading
  const error = reqQ.error ?? tcQ.error

  return (
    <>
      {form !== undefined && (
        <ReqForm editing={form} onClose={() => setForm(undefined)} />
      )}
      {bulkEditOpen && (
        <ReqBulkEdit
          ids={pickedReqs}
          onClose={() => setBulkEditOpen(false)}
          onDone={(msg) => {
            setBulkEditOpen(false)
            treeSel.clear()
            window.alert(msg)
            void qc.invalidateQueries({ queryKey: ['req', 'list'] })
            void qc.invalidateQueries({ queryKey: ['reqs'] })
          }}
        />
      )}

      {bulkOpen && <ReqBulkForm onClose={() => setBulkOpen(false)} />}
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

      <div className="split" ref={splitRef}>
        {/* ── 왼쪽: 폴더 + 요구사항 한 트리 ─────────────────
            전에는 분류 트리와 요구사항 목록이 따로였다. 자료가 29건 ·
            분류 20개라 전체가 한 화면에 들어오는데 두 단계로 고르게 하고
            있었다. Zephyr Enterprise 처럼 폴더 안에 요구사항을 둔다. */}
        <section className="panel req-tree-panel" style={{ flexBasis: catW }}>
          {/* 한 줄에 다 넣는다. 건수를 따로 아래에 두면 그만큼 목록이 준다. */}
          <ListHead
            name="요구사항"
            count={allReqs.length}
            picked={
              // 한 건만 고른 것은 그냥 여는 것이라 알릴 것이 없다.
              // 둘부터가 「여럿을 쥐고 있다」 는 뜻이다.
              picked.size > 1 ? (
                // 「3건 삭제」 라고 적어 두었더니 눌러야 지워지는 단추인데
                // 이미 지운 것처럼 읽혔다. 몇 개 골랐는지만 알리고, 지우는
                // 것은 ⋯ 안에 둔다 — 되돌릴 수 없는 일은 한 걸음 안쪽에.
                <span className="lh-picked">
                  {picked.size}건 선택됨
                  <button type="button" onClick={treeSel.clear} title="선택 해제">
                    ✕
                  </button>
                </span>
              ) : undefined
            }
            search={{
              value: treeQ,
              placeholder: 'REQ ID · 제목 검색',
              onChange: setTreeQ,
            }}
            add={{ title: '요구사항 만들기', onClick: () => setForm(null) }}
            menu={
              <>
                <button type="button" onClick={() => setForm(null)}>
                  요구사항 만들기
                </button>
                <button
                  type="button"
                  disabled={!selectedReq}
                  onClick={() => selectedReq && setForm(selectedReq)}
                >
                  선택 요구사항 편집
                </button>
                <button type="button" onClick={() => setAddFolder((n) => n + 1)}>
                  최상위 폴더 추가
                </button>
                <button type="button" onClick={() => setBulkOpen(true)}>
                  요구사항 일괄 생성
                </button>
                {picked.size > 1 && (
                  <>
                    <hr />
                    <button type="button" onClick={() => setBulkEditOpen(true)}>
                      선택한 {picked.size}건 한꺼번에 고치기
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={removeManyM.isPending}
                      onClick={doRemovePicked}
                    >
                      {removeManyM.isPending ? '삭제 중…' : `선택한 ${picked.size}건 삭제`}
                    </button>
                  </>
                )}
                <hr />
                <button type="button" onClick={() => setFoldersOnly((v) => !v)}>
                  {foldersOnly ? '✓ ' : ''}폴더 구조만 보기
                </button>
                <button type="button" onClick={() => setFullId((v) => !v)}>
                  {fullId ? '✓ ' : ''}전체 ID 보기
                </button>
                <hr />
                <button type="button" onClick={() => setSort('id')}>
                  {sort === 'id' ? '✓ ' : ''}ID 순으로 정렬
                </button>
                <button type="button" onClick={() => setSort('title')}>
                  {sort === 'title' ? '✓ ' : ''}제목 순으로 정렬
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
                setSelected(pk)
                setSelectedFolder(undefined)
              }}
              view={{ fullId, foldersOnly }}
              q={treeQ}
              selectedFolder={selectedFolder}
              onSelectFolder={(id) => {
                setSelectedFolder(id)
                setSelected(null)
                setTab('tc')
              }}
              picked={picked}
              onRowClick={treeSel.onClick}
              sort={sort}
              addFolderSignal={addFolder}
            />
          )}
        </section>

        <Resizer
          label="요구사항 트리 폭 조절"
          onResize={setCatW}
          getOrigin={() => splitRef.current?.getBoundingClientRect().left ?? 0}
        />


        {/* ── 오른쪽: 탭에 따라 내용이 바뀐다 ─────────────── */}
        <section className="panel tc-panel">
          <div className="panel-title">
            {/* 폴더를 보고 있을 때는 탭을 띄우지 않는다. REQ Info·Details·
                이력은 요구사항 한 건에만 있는 것이라, 폴더에 걸어두면 늘
                비어 있는 탭이 넷 생긴다. 폴더에서는 TC 목록 하나면 된다. */}
            {folderMode ? (
              <span className="fold-title">
                <b>📁 {folderName}</b>
                <span className="muted small">
                  요구사항 {folderReqs.length}건 · 하위 폴더 포함
                </span>
                <button
                  className="btn small"
                  type="button"
                  onClick={() => setSelectedFolder(undefined)}
                >
                  닫기
                </button>
              </span>
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
            {tab === 'tc' && !folderMode && (
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
            <div className="empty">왼쪽에서 요구사항이나 폴더를 선택하세요.</div>
          ) : !folderMode && selectedReq && tab !== 'tc' ? (
            <ReqDetail req={selectedReq} tcs={linked} tab={tab} />
          ) : (
            <div className={`tc-body scroll${folderMode ? ' by-folder' : ''}`}>
              {/* 커버리지 상태. 목록만 있으면 '이 요구사항이 덮였나' 를
                  눈으로 세어야 한다. 한 줄로 먼저 답한다. */}
              <div className={`cov-bar ${linked.length === 0 ? 'none' : cov.fail > 0 ? 'bad' : cov.idle > 0 ? 'warn' : 'good'}`}>
                {linked.length === 0 ? (
                  <>
                    <b>미커버</b>
                    <span className="muted small">
                      {folderMode
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
                  {folderMode && <div>요구사항</div>}
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
                      {folderMode && (
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
                  {folderMode
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
