import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { autoColor, paintOfAny } from './palette'
import { ICON_SETS } from './emoji'
import { PALETTE as FULL } from '@/components/settings/ColorPick'
import { multiJoin, multiVals, type NCol, type NOption, type NPerson, type NType } from './types'
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
export function Pill({
  value, color, caret, icon, show = 'both',
}: {
  value: string
  color?: string
  caret?: boolean
  /** 값 앞 그림 — 있으면 점 대신 그린다 */
  icon?: string
  /** 글자만 · 그림만 · 둘 다(지시) */
  show?: 'text' | 'icon' | 'both'
}) {
  if (!value) return <span className="ntb-empty">–</span>
  const p = paintOfAny(color ?? autoColor(value))
  const onlyIcon = show === 'icon' && !!icon
  return (
    <span
      className={`ntb-pill${onlyIcon ? ' only' : ''}`}
      style={{ background: p.bg, color: p.fg }}
      title={value}
    >
      {icon && show !== 'text' ? (
        <i className="ntb-ico">{icon}</i>
      ) : (
        <i className="ntb-dot" style={{ background: p.dot }} />
      )}
      {!onlyIcon && value}
      {caret && <i className="ntb-car">▾</i>}
    </span>
  )
}

/* ── 선택 셀 편집기 — 값 고르기 · 새 값 만들기 · 선택지 이름/색 고치기 ── */
export function SelectEditor({
  col, value, at, onPick, onCol, onClose, lockDefs,
}: {
  lockDefs?: boolean
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
  /** 여러 개 고르는 칸이면 골라도 안 닫는다 — 계속 담을 수 있게 */
  const many = col.type === 'multiselect'
  const cur = many ? multiVals(value) : []
  const has = (v: string) => (many ? cur.includes(v) : value === v)
  const toggle = (v: string) => {
    if (!many) {
      onPick(v)
      onClose()
      return
    }
    onPick(multiJoin(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]))
  }
  const nq = q.trim().normalize('NFC').toLowerCase()
  const hit = opts.filter((o) => !nq || o.value.normalize('NFC').toLowerCase().includes(nq))
  const exact = opts.some((o) => o.value === q.trim())

  const setOpts = (next: NOption[]) => onCol({ ...col, options: next })

  return (
    <Pop at={at} w={210} onClose={onClose}>
      <input
        className="ntb-inp"
        autoFocus
        placeholder={lockDefs ? '값 찾기' : '값 찾기 · 새 값 입력'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter') {
            const t = q.trim()
            if (!t) return
            if (!exact && lockDefs) return /* 선택지는 SETUP 이 정본 — 여기서 못 만든다 */
            if (!exact) setOpts([...opts, { value: t, color: autoColor(t) }])
            toggle(t)
            if (!many) onClose()
            setQ('')
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
            <button type="button" className="ntb-optb" onClick={() => toggle(o.value)}>
              <Pill value={o.value} color={o.color} icon={o.icon} show={o.show} />
            </button>
            {has(o.value) && <IcCheck className="ntb-chk" />}
            {!lockDefs && (
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
            )}
          </div>
        ))}
        {!hit.length && !q.trim() && <div className="ntb-sec">선택지가 없습니다</div>}
      </div>
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
      {q.trim() && !exact && !lockDefs && (
        <>
          <div className="ntb-hr" />
          <button
            type="button"
            className="ntb-mi"
            onClick={() => {
              const t = q.trim()
              setOpts([...opts, { value: t, color: autoColor(t) }])
              toggle(t)
              if (!many) onClose()
              setQ('')
            }}
          >
            <IcPlus />
            <span className="l">「{q.trim()}」 만들기</span>
          </button>
        </>
      )}
    </Pop>
  )
}

/**
 * 선택지 하나 고치기 — **한눈에 들어오게**(지적: 설정하기 너무 어렵다).
 * 색은 점 한 줄, 그림은 눌러야 펼친다. 겹쳐 뜨는 판을 하나 줄였다.
 */
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
  const [showIcons, setShowIcons] = useState(false)
  const keep = (p: Partial<NOption>) => onSave({ ...opt, value: name.trim() || opt.value, ...p })
  return (
    <Pop at={at} w={252} h={showIcons ? 420 : 210} onClose={onClose}>
      <input
        className="ntb-inp"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && name.trim()) keep({})
        }}
        onBlur={() => name.trim() && name.trim() !== opt.value && keep({})}
      />
      {/* 색 — 점 한 줄이면 열 가지가 한눈에 든다(목록으로 늘어놓으면 스크롤) */}
      <div className="ntb-sec">색</div>
      <ColorRow
        cur={opt.color?.startsWith('#') ? opt.color : (paintOfAny(opt.color).dot ?? '')}
        onPick={(c) => keep({ color: c })}
      />
      {/* 그림 — 안 쓰는 사람이 많아 접어 둔다 */}
      <button type="button" className="ntb-mi" onClick={() => setShowIcons((v) => !v)}>
        <span className="l">그림 {opt.icon ? opt.icon : '없음'}</span>
        <span className="ntb-sub">{showIcons ? '접기' : '고르기 ›'}</span>
      </button>
      {showIcons && <IconPick cur={opt.icon ?? ''} onPick={(e) => keep({ icon: e })} />}
      <div className="ntb-hr" />
      <button type="button" className="ntb-mi dg" onClick={onRemove}>
        <IcTrash />
        <span className="l">삭제</span>
      </button>
    </Pop>
  )
}

/** 색 고르개 — **판 안에서**, 107색을 **한눈에 다** 편다.
    띄우는 판은 화면 밖으로 나가 못 골랐고(지적), 계열을 접으면 색이
    줄어든 것처럼 보였다(지적). 그래서 옛 INFO 필드와 같은 격자 그대로. */
function ColorRow({ cur, onPick }: { cur: string; onPick: (c: string) => void }) {
  const series = useMemo(() => {
    const m = new Map<string, Array<{ nm: string; color: string }>>()
    for (const p of FULL) {
      const k = p.nm.split(' · ')[0] ?? p.nm
      m.set(k, [...(m.get(k) ?? []), { nm: p.nm, color: p.color }])
    }
    return [...m.entries()]
  }, [])
  const curHex = (cur || '').toLowerCase()
  return (
    <div className="ntb-colors">
      {series.map(([k, v]) => (
        <div className="ntb-crow2" key={k}>
          <span className="ntb-cname">{k}</span>
          {v.map((x) => (
            <button
              type="button"
              key={x.color}
              title={x.nm}
              className={`ntb-cs${x.color.toLowerCase() === curHex ? ' on' : ''}`}
              style={{ background: x.color }}
              onClick={() => onPick(x.color)}
            />
          ))}
        </div>
      ))}
      <div className="ntb-crow2">
        <span className="ntb-cname">직접</span>
        <input
          type="color"
          className="ntb-cany"
          value={curHex || '#9ca3af'}
          onChange={(e) => onPick(e.target.value)}
        />
      </div>
    </div>
  )
}

/** 그림 고르개 — 갈래로 묶고 이름으로 찾는다 */
function IconPick({ cur, onPick }: { cur: string; onPick: (e: string) => void }) {
  const [q, setQ] = useState('')
  const nq = q.trim().toLowerCase()
  return (
    <div className="ntb-ipick">
      <input
        className="ntb-inp"
        placeholder="그림 찾기 — 수동 · 합격 · 장비 …"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ntb-icons">
        <button type="button" className={`ntb-icb${cur ? '' : ' on'}`} title="그림 없이" onClick={() => onPick('')}>
          ●
        </button>
      </div>
      {ICON_SETS.map((g) => {
        const hit = g.items.filter((i) => !nq || i.k.includes(nq) || g.group.includes(nq))
        if (!hit.length) return null
        return (
          <div key={g.group}>
            <div className="ntb-sec">{g.group}</div>
            <div className="ntb-icons">
              {hit.map((i) => (
                <button
                  type="button"
                  key={i.e}
                  className={`ntb-icb${cur === i.e ? ' on' : ''}`}
                  title={i.k}
                  onClick={() => onPick(i.e)}
                >
                  {i.e}
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
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

/** 선택지 관리 — 값 추가·이름·색·그림·삭제를 한 자리에서(노션의 「속성 편집」) */
export function OptionsManager({
  col, at, onCol, onClose,
}: {
  col: NCol
  at: { x: number; y: number }
  onCol: (next: NCol) => void
  onClose: () => void
}) {
  const [add, setAdd] = useState('')
  /** 그 자리에서 펴서 고친다 — 판이 세 겹으로 겹치던 것을 없앤다(지적) */
  const [open, setOpen] = useState('')
  const opts = col.options ?? []
  const setOpts = (next: NOption[]) => onCol({ ...col, options: next })
  return (
    <Pop at={at} w={300} h={440} onClose={onClose}>
      <div className="ntb-sec">「{col.label}」 의 고를 값</div>
      <div className="ntb-list">
        {opts.map((o, i) => (
          <div key={o.value}>
          <div className="ntb-opt">
            <span className="ntb-ord">
              <button
                type="button"
                disabled={i === 0}
                title="위로"
                onClick={() => {
                  const n = [...opts]
                  const [x] = n.splice(i, 1)
                  if (x) n.splice(i - 1, 0, x)
                  setOpts(n)
                }}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === opts.length - 1}
                title="아래로"
                onClick={() => {
                  const n = [...opts]
                  const [x] = n.splice(i, 1)
                  if (x) n.splice(i + 1, 0, x)
                  setOpts(n)
                }}
              >
                ↓
              </button>
            </span>
            <Pill value={o.value} color={o.color} icon={o.icon} show={o.show} />
            <button
              type="button"
              className="ntb-more"
              title="이름·색·그림 고치기"
              onClick={() => setOpen(open === o.value ? '' : o.value)}
            >
              {open === o.value ? '▾' : '⋯'}
            </button>
          </div>
          {open === o.value && (
            /* 그 줄 밑에서 바로 고친다 — 새 판이 안 뜬다 */
            <div className="ntb-inline" key={`e-${o.value}`}>
              <input
                className="ntb-inp"
                defaultValue={o.value}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key !== 'Enter') return
                  const t = (e.target as HTMLInputElement).value.trim()
                  if (t) setOpts(opts.map((x) => (x.value === o.value ? { ...x, value: t } : x)))
                }}
                onBlur={(e) => {
                  const t = e.target.value.trim()
                  if (t && t !== o.value)
                    setOpts(opts.map((x) => (x.value === o.value ? { ...x, value: t } : x)))
                }}
              />
              {/* 색 — 옛 INFO 필드가 쓰던 **107색 고르개**를 그대로 쓴다
                  (지적: 색이 다양하지 않다). 계열마다 진함→여림 여섯 단계 */}
              <div className="ntb-sec">색</div>
              <ColorRow
                cur={o.color?.startsWith('#') ? o.color : (paintOfAny(o.color).dot ?? '')}
                onPick={(c) => setOpts(opts.map((x) => (x.value === o.value ? { ...x, color: c } : x)))}
              />
              <div className="ntb-sec">보이기</div>
              <div className="ntb-segs">
                {([['both', '둘 다'], ['text', '글자만'], ['icon', '그림만']] as const).map(([k, lab]) => (
                  <button
                    type="button"
                    key={k}
                    className={`ntb-seg${(o.show ?? 'both') === k ? ' on' : ''}`}
                    title={k === 'icon' && !o.icon ? '아래에서 그림을 고르면 그림만 보입니다' : ''}
                    onClick={() => setOpts(opts.map((x) => (x.value === o.value ? { ...x, show: k } : x)))}
                  >
                    {lab}
                  </button>
                ))}
              </div>
              <IconPick
                cur={o.icon ?? ''}
                onPick={(e) => setOpts(opts.map((x) => (x.value === o.value ? { ...x, icon: e } : x)))}
              />
              <button
                type="button"
                className="ntb-mi dg"
                onClick={() => {
                  setOpts(opts.filter((x) => x.value !== o.value))
                  setOpen('')
                }}
              >
                <IcTrash />
                <span className="l">삭제</span>
              </button>
            </div>
          )}
        </div>
        ))}
        {!opts.length && <div className="ntb-sec">아직 값이 없습니다</div>}
      </div>
      <div className="ntb-hr" />
      <input
        className="ntb-inp"
        placeholder="값 추가 — 적고 Enter"
        value={add}
        onChange={(e) => setAdd(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key !== 'Enter') return
          const t = add.trim()
          if (!t || opts.some((o) => o.value === t)) return
          setOpts([...opts, { value: t, color: autoColor(t) }])
          setAdd('')
        }}
      />
    </Pop>
  )
}

/* ── 헤더 필드 메뉴 ── */
export function FieldMenu({
  col, at, canDelete, onCol, onSort, onFilter, onGroup, onInsert, onDup, onClose, lockDefs,
}: {
  lockDefs?: boolean
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
  const [optAt, setOptAt] = useState<{ x: number; y: number } | null>(null)
  const TYPES: Array<{ k: NType; label: string }> = [
    { k: 'text', label: '텍스트' },
    { k: 'select', label: '선택' },
    { k: 'multiselect', label: '다중 선택' },
    { k: 'number', label: '숫자' }, { k: 'date', label: '날짜' }, { k: 'person', label: '사람' },
  ]
  const Cur = TYPE_ICON[col.type]
  const go = (fn: () => void) => { fn(); onClose() }
  return (
    <Pop at={at} w={228} h={430} onClose={onClose}>
      <input
        className="ntb-inp"
        readOnly={lockDefs}
        title={lockDefs ? '이름은 SETUP 에서 고칩니다' : ''}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return
          if (e.key === 'Enter' && name.trim()) go(() => onCol({ ...col, label: name.trim() }))
        }}
        onBlur={() => name.trim() && name.trim() !== col.label && onCol({ ...col, label: name.trim() })}
      />
      {/* 노션과 같은 두 줄 — 속성 편집(고를 값)과 유형 변경(칸 종류) */}
      {(col.type === 'select' || col.type === 'multiselect') && (
        <button
          type="button"
          className="ntb-mi"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setOptAt({ x: r.right + 6, y: r.top - 40 })
          }}
        >
          <IcSelect />
          <span className="l">속성 편집</span>
          <span className="ntb-sub">{(col.options ?? []).length}개 ›</span>
        </button>
      )}
      <button
        type="button"
        className="ntb-mi"
        disabled={col.fixed || lockDefs}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          setTypeAt(typeAt ? null : { x: r.right + 6, y: r.top })
        }}
      >
        <Cur />
        <span className="l">유형 변경</span>
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
      <button type="button" className="ntb-mi" disabled={lockDefs} onClick={() => go(() => onInsert('left'))}>
        <IcLeft /><span className="l">왼쪽에 삽입</span>
      </button>
      <button type="button" className="ntb-mi" disabled={lockDefs} onClick={() => go(() => onInsert('right'))}>
        <IcRight /><span className="l">오른쪽에 삽입</span>
      </button>
      <button type="button" className="ntb-mi" disabled={lockDefs} onClick={() => go(onDup)}>
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
      {optAt && (
        <OptionsManager col={col} at={optAt} onCol={onCol} onClose={() => setOptAt(null)} />
      )}
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
                onClick={() => {
                  onCol({ ...col, type: t.k })
                  setTypeAt(null)
                  /* 고를 값이 있어야 뜻이 생기는 종류면 곧바로 속성 편집으로
                     잇는다 — 바꾸고 나서 어디서 값을 넣는지 헤매지 않게 */
                  if ((t.k === 'select' || t.k === 'multiselect') && !(col.options ?? []).length) {
                    setOptAt({ x: at.x + 240, y: at.y })
                  } else onClose()
                }}
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
