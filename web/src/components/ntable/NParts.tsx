import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PALETTE, PALETTE_KEYS, autoColor, paintOfAny } from './palette'
import type { NCol, NOption, NPerson, NType } from './types'
import {
  IcCheck, IcCopy, IcDate, IcFilter, IcGroup, IcHide, IcLeft, IcNumber, IcPerson,
  IcPlus, IcRight, IcSelect, IcSortAsc, IcSortDesc, IcText, IcTrash, TYPE_ICON,
} from './NIcons'

/* ── 팝오버 바탕 — 화면 밖으로 안 나가게 되밀고, 겹침에 안 잘리게 포털로 ── */
export function Pop({
  at, w, h = 330, onClose, children, className = '',
}: {
  at: { x: number; y: number }
  w: number
  h?: number
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const x = Math.max(8, Math.min(at.x, window.innerWidth - w - 8))
  const y = Math.max(8, Math.min(at.y, window.innerHeight - h - 8))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return createPortal(
    <>
      <span className="ntb-ovl" onMouseDown={onClose} />
      <div className={`ntb-pop ${className}`} style={{ left: x, top: y, width: w }}>
        {children}
      </div>
    </>,
    document.body,
  )
}

/** 값 알약 — 점 + 글자(+ ▾). 색은 옵션 정의에서 온다 */
export function Pill({ value, color, caret }: { value: string; color?: string; caret?: boolean }) {
  if (!value) return <span className="ntb-empty">–</span>
  const p = paintOfAny(color ?? autoColor(value))
  return (
    <span className="ntb-pill" style={{ background: p.bg, color: p.fg }}>
      <i className="ntb-dot" style={{ background: p.dot }} />
      {value}
      {caret && <i className="ntb-car">▾</i>}
    </span>
  )
}

/* ── 선택 셀 편집기 — 값 고르기 · 새 값 만들기 · 선택지 이름/색 고치기 ── */
export function SelectEditor({
  col, value, at, onPick, onCol, onClose,
}: {
  col: NCol
  value: string
  at: { x: number; y: number }
  onPick: (v: string) => void
  onCol: (next: NCol) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<{ opt: NOption; x: number; y: number } | null>(null)
  const opts = col.options ?? []
  const nq = q.trim().normalize('NFC').toLowerCase()
  const hit = opts.filter((o) => !nq || o.value.normalize('NFC').toLowerCase().includes(nq))
  const exact = opts.some((o) => o.value === q.trim())

  const setOpts = (next: NOption[]) => onCol({ ...col, options: next })

  return (
    <Pop at={at} w={210} onClose={onClose}>
      <input
        className="ntb-inp"
        autoFocus
        placeholder="값 찾기 · 새 값 입력"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') {
            const t = q.trim()
            if (!t) return
            if (!exact) setOpts([...opts, { value: t, color: autoColor(t) }])
            onPick(t)
            onClose()
          }
        }}
      />
      <div className="ntb-sec">선택지</div>
      <div className="ntb-list">
        <button type="button" className="ntb-opt" onClick={() => { onPick(''); onClose() }}>
          <span className="ntb-empty">– 비움</span>
        </button>
        {hit.map((o) => (
          <div className="ntb-opt" key={o.value}>
            <button type="button" className="ntb-optb" onClick={() => { onPick(o.value); onClose() }}>
              <Pill value={o.value} color={o.color} />
            </button>
            {o.value === value && <IcCheck className="ntb-chk" />}
            <button
              type="button"
              className="ntb-more"
              title="이 선택지 고치기"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                setEdit({ opt: o, x: r.right + 6, y: r.top - 40 })
              }}
            >
              ⋯
            </button>
          </div>
        ))}
        {!hit.length && !q.trim() && <div className="ntb-sec">선택지가 없습니다</div>}
      </div>
      {q.trim() && !exact && (
        <>
          <div className="ntb-hr" />
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              const t = q.trim()
              setOpts([...opts, { value: t, color: autoColor(t) }])
              onPick(t)
              onClose()
            }}
          >
            <IcPlus />
            <span className="l">「{q.trim()}」 만들기</span>
          </button>
        </>
      )}
      {edit && (
        <OptionEdit
          opt={edit.opt}
          at={{ x: edit.x, y: edit.y }}
          onClose={() => setEdit(null)}
          onSave={(next) => {
            setOpts(opts.map((o) => (o.value === edit.opt.value ? next : o)))
            setEdit(null)
          }}
          onRemove={() => {
            setOpts(opts.filter((o) => o.value !== edit.opt.value))
            setEdit(null)
          }}
        />
      )}
    </Pop>
  )
}

/** 선택지 하나 고치기 — 이름 · 색(팔레트) · 삭제 */
function OptionEdit({
  opt, at, onSave, onRemove, onClose,
}: {
  opt: NOption
  at: { x: number; y: number }
  onSave: (o: NOption) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(opt.value)
  return (
    <Pop at={at} w={168} onClose={onClose}>
      <div className="ntb-sec">「{opt.value}」 고치기</div>
      <input
        className="ntb-inp"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && name.trim()) onSave({ ...opt, value: name.trim() })
        }}
        onBlur={() => name.trim() && name.trim() !== opt.value && onSave({ ...opt, value: name.trim() })}
      />
      <div className="ntb-sec">색</div>
      <div className="ntb-list">
        {PALETTE_KEYS.map((k) => (
          <button
            type="button"
            className="ntb-opt"
            key={k}
            onClick={() => onSave({ value: name.trim() || opt.value, color: k })}
          >
            <span className="ntb-sw" style={{ background: PALETTE[k]?.bg, borderColor: PALETTE[k]?.dot }} />
            {PALETTE[k]?.label}
            {k === opt.color && <IcCheck className="ntb-chk" />}
          </button>
        ))}
      </div>
      <div className="ntb-hr" />
      <button type="button" className="ntb-mi dg" onClick={onRemove}>
        <IcTrash />
        <span className="l">선택지 삭제</span>
      </button>
    </Pop>
  )
}

/* ── 사람 셀 — 조직 클릭 → 사람 클릭 ── */
export function PersonEditor({
  people, value, at, me, onPick, onClose,
}: {
  people: NPerson[]
  value: string
  at: { x: number; y: number }
  me?: string
  onPick: (v: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const orgs = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const u of people) {
      const k = u.org || '기타'
      m.set(k, [...(m.get(k) ?? []), u.name])
    }
    return [...m.entries()].sort((a, b) =>
      a[0] === '기타' ? 1 : b[0] === '기타' ? -1 : a[0].localeCompare(b[0], 'ko'),
    )
  }, [people])
  const [org, setOrg] = useState(() => people.find((u) => u.name === value)?.org || orgs[0]?.[0] || '')
  const nq = q.trim().normalize('NFC').toLowerCase()
  const list = nq
    ? people.filter((u) => `${u.name} ${u.org}`.normalize('NFC').toLowerCase().includes(nq))
    : people.filter((u) => (u.org || '기타') === org).map((u) => ({ name: u.name, org: '' }))

  return (
    <Pop at={at} w={296} onClose={onClose}>
      <div className="ntb-quick">
        {me && (
          <button type="button" className="ntb-me" onClick={() => { onPick(me); onClose() }}>
            나에게 ({me})
          </button>
        )}
        <button type="button" className="ntb-clear" onClick={() => { onPick(''); onClose() }}>– 비움</button>
      </div>
      <input
        className="ntb-inp"
        autoFocus
        placeholder="이름 · 조직으로 찾기"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ntb-two">
        <div className="ntb-orgs">
          <div className="ntb-sec">조직</div>
          {orgs.map(([o, names]) => (
            <button
              type="button"
              key={o}
              className={`ntb-org${o === org && !nq ? ' on' : ''}`}
              onClick={() => { setQ(''); setOrg(o) }}
            >
              <span className="nm">{o}</span>
              <span className="cnt">{names.length}</span>
            </button>
          ))}
        </div>
        <div className="ntb-list">
          <div className="ntb-sec">사람</div>
          {list.map((u, i) => (
            <button
              type="button"
              key={`${u.name}-${i}`}
              className="ntb-opt"
              onClick={() => { onPick(u.name); onClose() }}
            >
              <span className="ntb-av">{u.name.slice(0, 1)}</span>
              {u.name}
              {u.org && <span className="ntb-sub">{u.org}</span>}
              {u.name === value && <IcCheck className="ntb-chk" />}
            </button>
          ))}
          {!list.length && <div className="ntb-sec">맞는 사람이 없습니다</div>}
        </div>
      </div>
    </Pop>
  )
}

/* ── 날짜 셀 — 달력 ── */
export function DateEditor({
  value, at, onPick, onClose,
}: {
  value: string
  at: { x: number; y: number }
  onPick: (v: string) => void
  onClose: () => void
}) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date()
  const [ym, setYm] = useState({ y: base.getFullYear(), m: base.getMonth() })
  const first = new Date(ym.y, ym.m, 1)
  const pad = first.getDay()
  const days = new Date(ym.y, ym.m + 1, 0).getDate()
  const cells: Array<number | null> = [
    ...Array.from({ length: pad }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ]
  const fmt = (d: number) =>
    `${ym.y}-${String(ym.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const move = (d: number) => {
    const n = ym.m + d
    setYm({ y: ym.y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 })
  }
  return (
    <Pop at={at} w={236} h={330} onClose={onClose}>
      <input
        className="ntb-inp"
        value={value}
        placeholder="YYYY-MM-DD"
        onChange={(e) => onPick(e.target.value)}
      />
      <div className="ntb-calh">
        {ym.y}년 {ym.m + 1}월
        <span className="sp" />
        <button type="button" onClick={() => move(-1)}>‹</button>
        <button type="button" onClick={() => move(1)}>›</button>
      </div>
      <div className="ntb-cal">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
          <div className="h" key={d}>{d}</div>
        ))}
        {cells.map((d, i) =>
          d === null ? (
            <div key={`e${i}`} />
          ) : (
            <button
              type="button"
              key={d}
              className={fmt(d) === value ? 'on' : ''}
              onClick={() => { onPick(fmt(d)); onClose() }}
            >
              {d}
            </button>
          ),
        )}
      </div>
      <div className="ntb-hr" />
      <button type="button" className="ntb-mi" onClick={() => { onPick(''); onClose() }}>
        <span className="l">지우기</span>
      </button>
    </Pop>
  )
}

/* ── 글자·숫자 셀 — 그 자리 입력(커서 튐 방지) ── */
export function TextEditor({
  value, onSave, onCancel, numeric,
}: {
  value: string
  onSave: (v: string) => void
  onCancel: () => void
  numeric?: boolean
}) {
  const [t, setT] = useState(value)
  const caret = useRef(t.length)
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    if (t.trim() !== value.trim()) onSave(t.trim())
    else onCancel()
  }
  return (
    <input
      className="ntb-cellinp"
      inputMode={numeric ? 'numeric' : undefined}
      ref={(el) => {
        if (!el) return
        if (document.activeElement !== el) {
          el.focus()
          el.setSelectionRange(caret.current, caret.current)
        }
      }}
      value={t}
      onChange={(e) => {
        caret.current = e.target.selectionStart ?? e.target.value.length
        setT(e.target.value)
      }}
      onKeyUp={(e) => { caret.current = e.currentTarget.selectionStart ?? caret.current }}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.nativeEvent.isComposing || e.keyCode === 229) return
        if (e.key === 'Enter') finish()
        if (e.key === 'Escape') { done.current = true; onCancel() }
      }}
      onBlur={finish}
    />
  )
}

/* ── 헤더 필드 메뉴 ── */
export function FieldMenu({
  col, at, canDelete, onCol, onSort, onFilter, onGroup, onInsert, onDup, onClose,
}: {
  col: NCol
  at: { x: number; y: number }
  canDelete: boolean
  onCol: (next: NCol | null) => void
  onSort: (dir: 'asc' | 'desc') => void
  onFilter: () => void
  onGroup: () => void
  onInsert: (side: 'left' | 'right') => void
  onDup: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(col.label)
  const [typeAt, setTypeAt] = useState<{ x: number; y: number } | null>(null)
  const TYPES: Array<{ k: NType; label: string }> = [
    { k: 'text', label: '텍스트' }, { k: 'select', label: '선택' },
    { k: 'number', label: '숫자' }, { k: 'date', label: '날짜' }, { k: 'person', label: '사람' },
  ]
  const Cur = TYPE_ICON[col.type]
  const go = (fn: () => void) => { fn(); onClose() }
  return (
    <Pop at={at} w={228} h={430} onClose={onClose}>
      <input
        className="ntb-inp"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && name.trim()) go(() => onCol({ ...col, label: name.trim() }))
        }}
        onBlur={() => name.trim() && name.trim() !== col.label && onCol({ ...col, label: name.trim() })}
      />
      <button
        type="button"
        className="ntb-mi"
        disabled={col.fixed}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setTypeAt(typeAt ? null : { x: r.right + 6, y: r.top })
        }}
      >
        <Cur />
        <span className="l">타입</span>
        <span className="ntb-sub">{TYPES.find((t) => t.k === col.type)?.label} ›</span>
      </button>
      <div className="ntb-hr" />
      <button type="button" className="ntb-mi" onClick={() => go(() => onSort('asc'))}>
        <IcSortAsc /><span className="l">오름차순 정렬</span>
      </button>
      <button type="button" className="ntb-mi" onClick={() => go(() => onSort('desc'))}>
        <IcSortDesc /><span className="l">내림차순 정렬</span>
      </button>
      <button type="button" className="ntb-mi" onClick={() => go(onFilter)}>
        <IcFilter /><span className="l">필터 추가</span>
      </button>
      <button type="button" className="ntb-mi" disabled={col.type !== 'select'} onClick={() => go(onGroup)}>
        <IcGroup /><span className="l">이 필드로 그룹</span>
      </button>
      <div className="ntb-hr" />
      <button type="button" className="ntb-mi" onClick={() => go(() => onInsert('left'))}>
        <IcLeft /><span className="l">왼쪽에 삽입</span>
      </button>
      <button type="button" className="ntb-mi" onClick={() => go(() => onInsert('right'))}>
        <IcRight /><span className="l">오른쪽에 삽입</span>
      </button>
      <button type="button" className="ntb-mi" onClick={() => go(onDup)}>
        <IcCopy /><span className="l">속성 복제</span>
      </button>
      <button type="button" className="ntb-mi" disabled={col.fixed} onClick={() => go(() => onCol({ ...col, hidden: true }))}>
        <IcHide /><span className="l">숨기기</span>
      </button>
      <div className="ntb-hr" />
      <button
        type="button"
        className="ntb-mi dg"
        disabled={col.fixed || !canDelete}
        onClick={() => go(() => onCol(null))}
      >
        <IcTrash /><span className="l">삭제</span>
      </button>
      {typeAt && (
        <Pop at={typeAt} w={158} h={220} onClose={() => setTypeAt(null)}>
          <div className="ntb-sec">필드 타입</div>
          {TYPES.map((t) => {
            const I = TYPE_ICON[t.k]
            return (
              <button
                type="button"
                key={t.k}
                className="ntb-mi"
                onClick={() => { onCol({ ...col, type: t.k }); setTypeAt(null); onClose() }}
              >
                <I /><span className="l">{t.label}</span>
                {t.k === col.type && <IcCheck className="ntb-chk" />}
              </button>
            )
          })}
        </Pop>
      )}
    </Pop>
  )
}

export { IcText, IcSelect, IcNumber, IcDate, IcPerson, IcFilter, IcSortAsc, IcGroup, IcHide, IcPlus, IcTrash }
