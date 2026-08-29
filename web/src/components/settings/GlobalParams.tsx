import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import type { Device } from '@/pages/Devices'
import { IconChevron } from '@/components/icons'
import '@/components/ReqTree.css'

/** 파라미터 한 줄. 옛 화면(07-global-params.js)이 쓰는 모양 그대로다. */
interface Row {
  group?: string
  name?: string
  value?: string
  desc?: string
}

type File = Record<string, unknown>

/** 파일 이름. 공통은 키가 `__global__` 이라 그대로 보이면 안 된다. */
const label = (k: string) => (k === GLOBAL ? '공통 (모든 모델)' : k)

/** 공통 값이 들어가는 키. 옛 화면과 같은 이름을 써야 서로 읽는다. */
const GLOBAL = '__global__'
/** 옛 화면의 폴더 목록. 여기서는 안 건드리고 그대로 넘긴다 */
const FOLDERS = '__gp_folders__'
/** 활성 파일 목록 — 여기 켠 파일이 모든 TC 실행에 깔린다(합의:
    글로벌은 전역에서 정하고, TC 가 따로 고르지 않는다) */
const ACTIVE = '__active__'
/**
 * 파일이 끌어다 쓰는 다른 파일 — iTest 의 Include 탭.
 *
 * `{ "E4320": ["공통"] }` 처럼 담는다. 공통을 여기 걸어 두고 파일마다
 * 예외만 적는 것이 iTest 의 쓰는 법이다.
 */
const INCLUDES = '__includes__'

/**
 * 전역 파라미터.
 *
 * iTest 의 parameter file(.ffpt)에 해당한다. 스텝에 `${포트}` 라고 적어 두면
 * 실행할 때 여기 값이 들어간다 — 같은 시험을 E6100 과 E5724RL 에서 돌릴 때
 * 포트 이름이나 슬롯 번호가 다른 것을 여기서 흡수한다.
 *
 * **공통(`__global__`)에 적어 두고 모델에서 예외만 덮는다.** 그것이 이
 * 파일을 쓰는 이유다 — 모델마다 전부 적으면 파일이 그냥 목록이 된다.
 *
 * 자료 모양은 옛 화면과 같다. 한쪽에서 고친 것이 다른 쪽에서 안 보이면
 * 어느 것이 맞는지 알 수 없게 된다.
 */
interface Props {
  /**
   * 이 파일 하나만 편집한다.
   *
   * TC 화면의 트리에서 파일을 골라 들어오는 길이다 — 목록은 트리가 이미
   * 보여주고 있으므로 여기서 또 보이면 같은 목록이 두 군데가 된다.
   */
  only?: string
}

export default function GlobalParams({ only }: Props) {
  const qc = useQueryClient()
  const [sel, setSel] = useState(only ?? GLOBAL)
  const [data, setData] = useState<File>({})
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState('')
  const [msg, setMsg] = useState('')
  /**
   * 아직 파라미터가 하나도 없는 그룹.
   *
   * 그룹은 `group` 경로로만 존재하므로 줄이 없으면 화면에서 사라진다.
   * 만들자마자 없어지면 만들 수가 없어서, 저장 전까지 여기 들고 있는다.
   */
  const [emptyGroups, setEmptyGroups] = useState<string[]>([])
  /** 접힌 그룹 */
  const [shut, setShut] = useState<Set<string>>(new Set())
  /**
   * 이름을 고치는 중인 그룹.
   *
   * 글자마다 경로를 갈아치우면 'AB' 를 치는 사이 'A' 라는 그룹이 잠깐
   * 생기고, 그 이름이 이미 있으면 거기로 합쳐져 버린다. 다 치고 나서
   * (Enter·포커스 아웃) 한 번에 바꾼다.
   */
  const [editing, setEditing] = useState<{ path: string; text: string } | null>(null)

  const q = useQuery({
    queryKey: ['global-params'],
    queryFn: async () => {
      const r = await apiFetch('/api/global-params')
      if (!r.ok) throw new Error('불러오지 못했습니다')
      return (await r.json()) as File
    },
  })

  const devQ = useQuery({
    queryKey: ['devices2'],
    queryFn: async () => {
      const r = await apiFetch('/api/devices2')
      if (!r.ok) throw new Error('장비를 불러오지 못했습니다')
      return (await r.json()) as { devices?: Device[] }
    },
    staleTime: 60_000,
  })

  useEffect(() => {
    if (only) setSel(only)
  }, [only])

  // 파일이 바뀌면 그 파일의 빈 그룹만 뜻이 있다
  useEffect(() => {
    setEmptyGroups([])
  }, [sel])

  useEffect(() => {
    if (q.data) {
      setData(q.data)
      setDirty(false)
    }
  }, [q.data])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const saveM = useMutation({
    mutationFn: async () => {
      /* 이미 저장돼 있던 빈칸 이름도 여기서 함께 고친다 — 입력 때 바꾸는
         것만으로는 **손대지 않은 옛 이름**이 깨진 채 남는다. 어차피 그
         이름으로는 값을 꺼낼 수 없으니 남겨 둘 이유가 없다. */
      let fixed = 0
      const clean: File = {}
      for (const [file, rows2] of Object.entries(data)) {
        if (!Array.isArray(rows2)) {
          clean[file] = rows2 as never
          continue
        }
        clean[file] = (rows2 as Row[]).map((r) => {
          const nm = String(r.name ?? '')
          const ok = nameOk(nm)
          if (ok !== nm) fixed++
          return ok === nm ? r : { ...r, name: ok }
        })
      }
      const r = await apiFetch('/api/global-params', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      })
      if (!r.ok) throw new Error('저장하지 못했습니다')
      if (fixed) setData(clean)
      return fixed
    },
    onSuccess: (fixed) => {
      setDirty(false)
      /* 지나가는 알림(지시) — 저장은 끝나면 아무것도 안 바뀐 것처럼
         보여서, 눌린 게 맞나 한 번 더 누르게 된다. */
      setToast(fixed ? `저장되었습니다 — 빈칸이 든 이름 ${fixed}개를 밑줄로 고쳤습니다` : '저장되었습니다')
      setMsg('')
      void qc.invalidateQueries({ queryKey: ['global-params'] })
    },
    onError: (e) => setMsg(e instanceof Error ? e.message : String(e)),
  })

  /** 값이 든 파일만. 옛 화면의 폴더 키와 include·활성 표는 목록에 안 낸다. */
  const models = useMemo(
    () =>
      Object.keys(data)
        .filter((k) => k !== GLOBAL && k !== FOLDERS && k !== INCLUDES && k !== ACTIVE)
        .sort(),
    [data],
  )

  /** 활성 파일 — 없으면 공통만 켠 것으로 본다 */
  const active: string[] = Array.isArray(data[ACTIVE]) ? (data[ACTIVE] as string[]) : [GLOBAL]
  const toggleActive = (name: string) => {
    const next = active.includes(name) ? active.filter((x) => x !== name) : [...active, name]
    setData((d) => ({ ...d, [ACTIVE]: next }))
    setDirty(true)
  }

  /** 이 파일이 끌어다 쓰는 파일들 */
  const incMap = (data[INCLUDES] ?? {}) as Record<string, unknown>
  const includes: string[] = Array.isArray(incMap[sel]) ? (incMap[sel] as string[]) : []

  const setIncludes = (next: string[]) => {
    setData((d) => ({ ...d, [INCLUDES]: { ...((d[INCLUDES] ?? {}) as object), [sel]: next } }))
    setDirty(true)
    setMsg('')
  }

  /** 고를 수 있는 파일 — 자기 자신은 뺀다(자기를 끌어다 쓸 수는 없다) */
  const canInclude = [GLOBAL, ...models].filter((k) => k !== sel && !includes.includes(k))

  /** 등록된 장비의 모델 — 아직 파라미터가 없는 것도 고를 수 있어야 한다 */
  const known = useMemo(() => {
    const s = new Set<string>()
    for (const d of devQ.data?.devices ?? []) if (d.model) s.add(d.model)
    return [...s].sort().filter((m) => !models.includes(m))
  }, [devQ.data, models])

  const rows = (k: string): Row[] => (Array.isArray(data[k]) ? (data[k] as Row[]) : [])
  const cur = rows(sel)

  const setRows = (next: Row[]) => {
    setData((d) => ({ ...d, [sel]: next }))
    setDirty(true)
    setMsg('')
  }

  /**
   * 이름의 빈칸은 **밑줄로**(지시).
   *
   * 값은 `${이름}` 으로 꺼내 쓰는데, 치환기(judge.subVars)가 이름을 `\w+`
   * — 영문·숫자·밑줄로만 읽는다. 그래서 「Main Memory」 처럼 빈칸이 든
   * 이름은 값은 멀쩡히 저장되는데 **영영 안 풀린다**(실제로 213 에 두 개가
   * 그 꼴로 있었다). 에러도 안 나고 글자 그대로 남아 더 나쁘다.
   *
   * 빈칸을 허용하고 패턴만 넓히는 길도 있지만, 짧은 형태 `$이름` 은 끝을
   * 알 수 없어 원리상 빈칸을 못 받는다 — `${Main Memory}` 는 되고
   * `$Main Memory` 는 안 되는 어긋난 규칙이 생긴다. 이름을 한 가지로 맞춘다.
   */
  const nameOk = (v: string) => v.replace(/\s+/g, '_')

  const setCell = (i: number, key: keyof Row, v: string) =>
    setRows(cur.map((r, j) => (j === i ? { ...r, [key]: key === 'name' ? nameOk(v) : v } : r)))

  /** 표의 칸 차례 — 엑셀 3열(이름 · 값 · 설명)과 그대로 맞물린다 */
  const COLS: Array<keyof Row> = ['name', 'value', 'desc']

  /**
   * 엑셀에서 **여러 줄을 복사해 붙이면** 표에 그대로 채운다(지시).
   *
   * 엑셀은 칸을 탭, 줄을 줄바꿈으로 클립보드에 싣는다(TSV). 그래서 파일을
   * 올릴 것도, 엑셀 라이브러리도 필요 없다 — 붙여넣기를 가로채 쪼개면 된다.
   *
   * 붙인 **그 칸부터** 오른쪽·아래로 채운다. 줄은 **같은 그룹 안에서만**
   * 이어 쓴다 — `cur` 는 파일 전체가 한 줄로 늘어선 배열이라, 그냥 다음
   * 칸을 쓰면 옆 그룹의 값을 덮어쓴다. 모자라면 그 그룹으로 새 줄을 만든다.
   *
   * 탭도 줄바꿈도 없으면 **그냥 한 칸 붙여넣기**다 — 예전 그대로 둔다.
   */
  const pasteGrid = (i: number, key: keyof Row, txt: string): boolean => {
    if (!/[\t\r\n]/.test(txt)) return false
    const grid = txt
      .replace(/\r\n?/g, '\n')
      .replace(/\n+$/, '') // 엑셀은 끝에 줄바꿈을 하나 붙여 보낸다
      .split('\n')
      .map((ln) => ln.split('\t'))
    if (!grid.length) return false

    const c0 = Math.max(0, COLS.indexOf(key))
    const group = cur[i]?.group ?? ''
    // 이 줄부터, **같은 그룹**인 줄들이 채울 자리다
    const slots: number[] = []
    for (let k = i; k < cur.length; k++) if ((cur[k]?.group ?? '') === group) slots.push(k)

    const next = cur.slice()
    grid.forEach((cells, r) => {
      let at = slots[r]
      if (at === undefined) {
        next.push({ group, name: '', value: '', desc: '' })
        at = next.length - 1
      }
      const row = { ...next[at] }
      cells.forEach((v, c) => {
        const col = COLS[c0 + c]
        if (!col) return // 3열을 넘는 칸은 버린다
        const t = v.trim()
        row[col] = col === 'name' ? nameOk(t) : t
      })
      next[at] = row
    })
    setRows(next)
    setMsg(`${grid.length}줄을 채웠습니다 — 저장해야 반영됩니다`)
    return true
  }

  /**
   * 하위 그룹.
   *
   * 자료 모양은 그대로 두고 `group` 을 **경로**로 읽는다 — `QoS/class1`.
   * 새 필드를 만들면 옛 화면이 못 읽고, 한쪽에서 고친 것이 다른 쪽에서
   * 안 보이면 어느 것이 맞는지 알 수 없게 된다.
   *
   * iTest 도 파라미터를 그룹 단위로 묶고 그룹째 잘라 붙인다.
   */
  const path = (r: Row) => (r.group || '').trim().replace(/^\/+|\/+$/g, '')

  /** 이 경로 바로 아래의 그룹 이름들 */
  const childGroups = (base: string): string[] => {
    const pre = base ? base + '/' : ''
    const s = new Set<string>()
    for (const r of cur) {
      const g = path(r)
      if (!g.startsWith(pre)) continue
      const rest = g.slice(pre.length)
      if (!rest) continue
      const head = rest.split('/')[0]
      if (head) s.add(head)
    }
    // 비어 있는 그룹도 자리를 지킨다 — 만들자마자 사라지면 만들 수가 없다
    for (const g of emptyGroups) {
      if (!g.startsWith(pre)) continue
      const head = g.slice(pre.length).split('/')[0]
      if (head) s.add(head)
    }
    return [...s].sort()
  }

  /** 이 경로에 바로 달린 줄 (원본 자리 번호와 함께) */
  const rowsAt = (base: string) =>
    cur.map((r, i) => ({ r, i })).filter(({ r }) => path(r) === base)

  const groups = childGroups('')

  /**
   * 겹치지 않는 새 그룹 이름.
   *
   * 늘 '새 그룹' 으로 만들었더니 두 번째부터 같은 경로가 되어 하나로
   * 합쳐졌다 — 그룹은 경로로만 존재하기 때문이다.
   */
  const freshGroup = (base: string) => {
    const used = new Set(childGroups(base))
    if (!used.has('새 그룹')) return (base ? base + '/' : '') + '새 그룹'
    for (let n = 2; n < 500; n++) {
      if (!used.has(`새 그룹 ${n}`)) return (base ? base + '/' : '') + `새 그룹 ${n}`
    }
    return (base ? base + '/' : '') + `새 그룹 ${Date.now()}`
  }

  const add = (group: string) =>
    setRows([...cur, { group, name: '', value: '', desc: '' }])
  const del = (i: number) => setRows(cur.filter((_, j) => j !== i))

  /** 그룹을 지우면 그 아래 것이 전부 사라진다 — 몇 개인지 말해 준다 */
  const delGroup = (g: string) => {
    const n = cur.filter((r) => path(r) === g || path(r).startsWith(g + '/')).length
    if (n > 0 && !window.confirm(`「${g}」 아래 파라미터 ${n}개가 함께 사라집니다. 계속할까요?`))
      return
    setRows(cur.filter((r) => path(r) !== g && !path(r).startsWith(g + '/')))
    setEmptyGroups((s) => s.filter((x) => x !== g && !x.startsWith(g + '/')))
  }

  /** 그룹 이름 바꾸기 — 아래 것의 경로도 함께 */
  const renameGroup = (g: string, name: string) => {
    const parent = g.includes('/') ? g.slice(0, g.lastIndexOf('/')) : ''
    const next = (parent ? parent + '/' : '') + name.trim()
    if (!name.trim() || next === g) return
    // 형제 중에 같은 이름이 있으면 두 그룹이 조용히 하나가 된다
    if (childGroups(parent).includes(name.trim())) {
      setMsg(`「${name.trim()}」 은 이미 있습니다`)
      return
    }
    setRows(
      cur.map((r) => {
        const cp = path(r)
        if (cp === g) return { ...r, group: next }
        if (cp.startsWith(g + '/')) return { ...r, group: next + cp.slice(g.length) }
        return r
      }),
    )
    setEmptyGroups((s) => s.map((x) => (x === g || x.startsWith(g + '/') ? next + x.slice(g.length) : x)))
  }

  const addModel = (m: string) => {
    if (!m || data[m]) {
      setSel(m)
      return
    }
    setData((d) => ({ ...d, [m]: [] }))
    setDirty(true)
    setSel(m)
  }

  /** 한 칸 */
  const cell = (i: number, key: keyof Row, ph: string, mono = false) => (
    <input
      className={mono ? 'mono' : ''}
      value={cur[i]?.[key] ?? ''}
      placeholder={ph}
      /* 엑셀에서 여러 줄을 복사해 붙이면 표로 펴 넣는다(지시) */
      onPaste={(e) => {
        if (pasteGrid(i, key, e.clipboardData.getData('text/plain'))) e.preventDefault()
      }}
      onChange={(e) => setCell(i, key, e.target.value)}
    />
  )

  /**
   * 한 단계를 그린다 — 그 자리의 줄들과 하위 그룹.
   *
   * 깊이는 막지 않는다. 사람이 필요한 만큼 나눈다.
   */
  const node = (base: string, depth: number): ReactElement => {
    const mine = rowsAt(base)
    const kids = childGroups(base)
    return (
      <div key={base || '__root__'}>
        {mine.map(({ i }) => (
          <div className="gp-row" key={i} style={{ paddingLeft: 10 + depth * 16 }}>
            {cell(i, 'name', '업링크', true)}
            {cell(i, 'value', 'gi0/24', true)}
            {cell(i, 'desc', '설명 (선택)')}
            <button type="button" className="if-x" aria-label="지우기" onClick={() => del(i)}>
              ×
            </button>
          </div>
        ))}

        {kids.map((g) => {
          const full = (base ? base + '/' : '') + g
          const open = !shut.has(full)
          const n = cur.filter(
            (r) => path(r) === full || path(r).startsWith(full + '/'),
          ).length
          return (
            <div key={full}>
              <div className="gp-grp" style={{ paddingLeft: 10 + depth * 16 }}>
                <button
                  type="button"
                  className={`rt-caret${open ? ' open' : ''}`}
                  aria-label={open ? '접기' : '펼치기'}
                  onClick={() =>
                    setShut((s) => {
                      const x = new Set(s)
                      if (x.has(full)) x.delete(full)
                      else x.add(full)
                      return x
                    })
                  }
                >
                  <IconChevron />
                </button>
                <input
                  className="gp-gname"
                  value={editing?.path === full ? editing.text : g}
                  onFocus={() => setEditing({ path: full, text: g })}
                  onChange={(e) =>
                    setEditing({ path: full, text: e.target.value })
                  }
                  onBlur={() => {
                    if (editing?.path === full) renameGroup(full, editing.text)
                    setEditing(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    if (e.key === 'Escape') {
                      setEditing(null)
                      e.currentTarget.blur()
                    }
                  }}
                />
                <span className="gp-n">{n || ''}</span>
                <button
                  type="button"
                  className="gp-op"
                  title="이 그룹에 파라미터"
                  onClick={() => add(full)}
                >
                  ＋ 값
                </button>
                <button
                  type="button"
                  className="gp-op"
                  title="이 그룹 아래에 그룹"
                  // 빈 줄을 실제 자료로 넣는다 — 화면 상태로만 두면 저장이
                  // 안 켜지고 새로고침에 사라졌다(실사고: 「저장이 안 된다」)
                  onClick={() => add(freshGroup(full))}
                >
                  ＋ 하위
                </button>
                <button
                  type="button"
                  className="if-x"
                  aria-label="그룹 지우기"
                  onClick={() => delGroup(full)}
                >
                  ×
                </button>
              </div>
              {open && node(full, depth + 1)}
            </div>
          )
        })}
      </div>
    )
  }

  if (q.isLoading) return <div className="empty">불러오는 중…</div>
  if (q.error) return <div className="load-error">{(q.error as Error).message}</div>

  return (
    <div className="gp">
      {toast && <div className="gp-toast">{toast}</div>}
      <div className="gp-head">
        <b>{only ? label(only) : '전역 파라미터'}</b>
        <span className="muted small">
          스텝에 <code>{'${이름}'}</code> 으로 쓰면 실행할 때 이 값이 들어갑니다
        </span>
        <span className="sp" />
        {msg && <span className="muted small">{msg}</span>}
        {/* 값이 바뀌면 **청록으로 켜지고**, 저장하고 나면 옅은 청록으로
            가라앉는다(지시). 「저장할 게 있다」 를 글자가 아니라 색이
            먼저 말한다 — 글자는 다 읽어야 알지만 색은 안 읽어도 안다. */}
        <button
          className={`btn gp-save${dirty ? ' dirty' : ''}`}
          type="button"
          disabled={saveM.isPending || !dirty}
          onClick={() => saveM.mutate()}
        >
          {saveM.isPending ? '저장 중…' : dirty ? '저장' : '저장됨'}
        </button>
      </div>

      <div className="gp-body">
        {!only && (
        <div className="gp-side">
          {/* 공통이 맨 위. 여기 적고 모델에서 예외만 덮는 것이 이 파일을
              쓰는 방식이다. */}
          <button
            type="button"
            className={`gp-m${sel === GLOBAL ? ' on' : ''}`}
            onClick={() => setSel(GLOBAL)}
          >
            {/* 활성 = 모든 TC 실행에 깔린다(합의) — TC 쪽 선택은 없앴다 */}
            <input
              type="checkbox"
              title="활성 — 켜면 모든 TC 실행에 이 파일이 깔립니다"
              checked={active.includes(GLOBAL)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggleActive(GLOBAL)}
            />
            공통 (모든 모델)
            <span className="gp-n">{rows(GLOBAL).filter((r) => r.name).length || ''}</span>
          </button>

          {models.map((m) => (
            <button
              key={m}
              type="button"
              className={`gp-m${sel === m ? ' on' : ''}`}
              onClick={() => setSel(m)}
            >
              <input
                type="checkbox"
                title="활성 — 켜면 모든 TC 실행에 이 파일이 깔립니다 (아래가 위를 덮음)"
                checked={active.includes(m)}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleActive(m)}
              />
              {m}
              <span className="gp-n">{rows(m).filter((r) => r.name).length || ''}</span>
            </button>
          ))}
          <p className="muted small" style={{ padding: '4px 8px', margin: 0 }}>
            체크 = 활성. 활성 파일이 모든 TC 실행에 깔립니다 — 공통 먼저, 아래
            파일이 덮습니다. 저장해야 반영됩니다.
          </p>

          {/* 등록된 장비의 모델 중 아직 파라미터가 없는 것. 이름을 손으로
              치게 두면 오타 난 모델이 생기고, 그 값은 영영 안 쓰인다. */}
          {known.length > 0 && (
            <select
              className="gp-add"
              value=""
              onChange={(e) => e.target.value && addModel(e.target.value)}
            >
              <option value="">+ 모델 추가…</option>
              {known.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
        )}

        <div className="gp-main">
          <div className="gp-title">
            <b>{label(sel)}</b>
            {sel !== GLOBAL && (
              <span className="muted small">같은 이름이면 공통 값을 덮습니다</span>
            )}
            <span className="sp" />
            <button className="btn small" type="button" onClick={() => add('')}>
              ＋ 파라미터
            </button>
            <button
              className="btn small"
              type="button"
              onClick={() => add(freshGroup(''))}
            >
              ＋ 그룹
            </button>
          </div>

          {/* iTest 의 Include 탭. 공통을 여기 걸어 두고 이 파일에는 예외만
              적는다 — 파일마다 같은 값을 베껴 적으면 한 곳을 고칠 때 전부
              찾아다녀야 한다. */}
          <div className="gp-inc">
            <span className="muted small">이 파일이 끌어다 쓰는 파일</span>
            {includes.map((f) => (
              <span className="gp-inc-x" key={f}>
                {f === GLOBAL ? '공통' : f}
                <button
                  type="button"
                  aria-label={`${f} 빼기`}
                  onClick={() => setIncludes(includes.filter((x) => x !== f))}
                >
                  ×
                </button>
              </span>
            ))}
            {canInclude.length > 0 && (
              <select
                className="gp-inc-add"
                value=""
                onChange={(e) => e.target.value && setIncludes([...includes, e.target.value])}
              >
                <option value="">+ 끌어다 쓰기…</option>
                {canInclude.map((f) => (
                  <option key={f} value={f}>
                    {f === GLOBAL ? '공통' : f}
                  </option>
                ))}
              </select>
            )}
            {includes.length > 0 && (
              <span className="muted small">먼저 깔리고 이 파일이 그 위를 덮습니다</span>
            )}
          </div>

          {cur.length === 0 && groups.length === 0 ? (
            <div className="empty">
              아직 없습니다.
              <br />
              <span className="muted small">
                예) 이름 <code>업링크</code> · 값 <code>gi0/24</code> 라고 두면 스텝에
                <code>{' show interface ${업링크}'}</code> 라고 적을 수 있습니다.
              </span>
            </div>
          ) : (
            <div className="gp-tree">{node('', 0)}</div>
          )}
        </div>
      </div>
    </div>
  )
}
