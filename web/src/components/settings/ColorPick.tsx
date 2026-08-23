/**
 * 색 고르개 — **여러 화면이 같이 쓰는 한 벌**.
 *
 * 실행 판정 기준에만 있던 것을 떼어 냈다. INFO 필드에서도 값마다 색을
 * 고르는데 브라우저 기본 색고르개만 있어 쓰기가 힘들었다(지적: 색 선택이
 * 너무 불편하다 — 진한색부터 연한색까지 다량으로 달라).
 */
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './ColorPick.css'

/*
 * 색 한 벌 — **같은 색을 진하기별로**(지시).
 *
 * 한 줄이 한 색이고, 왼쪽이 진하고 오른쪽으로 갈수록 여려진다.
 * 진한 칸은 글자를 흰색으로, 여린 칸은 같은 계열의 짙은 글자로 미리 맞춰
 * 둔다 — 고르자마자 읽히는 짝이라야 쓸모가 있다.
 */
/*
 * 색 한 벌 — **계열마다 진함 → 여림 여섯 단계**(지시: 아주 다양하게).
 *
 * 열일곱 계열 × 여섯 단계 = 백 가지가 넘는다. 한 줄이 한 계열이고 왼쪽이
 * 진하다. 진한 쪽 셋은 글자를 흰색으로, 여린 쪽 셋은 그 계열의 가장 짙은
 * 색을 글자로 미리 맞춰 둔다 — 고르자마자 읽히는 짝이라야 쓸모가 있다.
 */
const PALETTE: Array<{ nm: string; color: string; fg: string }> = [
  { nm: '빨강 · 아주 진함', color: '#7f1d1d', fg: '#ffffff' },
  { nm: '빨강 · 진함', color: '#b91c1c', fg: '#ffffff' },
  { nm: '빨강', color: '#dc2626', fg: '#ffffff' },
  { nm: '빨강 · 밝음', color: '#f87171', fg: '#7f1d1d' },
  { nm: '빨강 · 옅음', color: '#fca5a5', fg: '#7f1d1d' },
  { nm: '빨강 · 여림', color: '#fee2e2', fg: '#7f1d1d' },

  { nm: '주황 · 아주 진함', color: '#7c2d12', fg: '#ffffff' },
  { nm: '주황 · 진함', color: '#c2410c', fg: '#ffffff' },
  { nm: '주황', color: '#ea580c', fg: '#ffffff' },
  { nm: '주황 · 밝음', color: '#fb923c', fg: '#7c2d12' },
  { nm: '주황 · 옅음', color: '#fdba74', fg: '#7c2d12' },
  { nm: '주황 · 여림', color: '#ffedd5', fg: '#7c2d12' },

  { nm: '호박 · 아주 진함', color: '#78350f', fg: '#ffffff' },
  { nm: '호박 · 진함', color: '#b45309', fg: '#ffffff' },
  { nm: '호박', color: '#e8820c', fg: '#ffffff' },
  { nm: '호박 · 밝음', color: '#fbbf24', fg: '#78350f' },
  { nm: '호박 · 옅음', color: '#fcd34d', fg: '#78350f' },
  { nm: '호박 · 여림', color: '#fef3c7', fg: '#78350f' },

  { nm: '노랑 · 아주 진함', color: '#713f12', fg: '#ffffff' },
  { nm: '노랑 · 진함', color: '#a16207', fg: '#ffffff' },
  { nm: '노랑', color: '#eab308', fg: '#ffffff' },
  { nm: '노랑 · 밝음', color: '#facc15', fg: '#713f12' },
  { nm: '노랑 · 옅음', color: '#fde68a', fg: '#713f12' },
  { nm: '노랑 · 여림', color: '#fefce8', fg: '#713f12' },

  { nm: '연두 · 아주 진함', color: '#365314', fg: '#ffffff' },
  { nm: '연두 · 진함', color: '#4d7c0f', fg: '#ffffff' },
  { nm: '연두', color: '#65a30d', fg: '#ffffff' },
  { nm: '연두 · 밝음', color: '#a3e635', fg: '#365314' },
  { nm: '연두 · 옅음', color: '#bef264', fg: '#365314' },
  { nm: '연두 · 여림', color: '#ecfccb', fg: '#365314' },

  { nm: '초록 · 아주 진함', color: '#14532d', fg: '#ffffff' },
  { nm: '초록 · 진함', color: '#15803d', fg: '#ffffff' },
  { nm: '초록', color: '#16a34a', fg: '#ffffff' },
  { nm: '초록 · 밝음', color: '#4ade80', fg: '#14532d' },
  { nm: '초록 · 옅음', color: '#86efac', fg: '#14532d' },
  { nm: '초록 · 여림', color: '#dcfce7', fg: '#14532d' },

  { nm: '에메랄드 · 아주 진함', color: '#064e3b', fg: '#ffffff' },
  { nm: '에메랄드 · 진함', color: '#047857', fg: '#ffffff' },
  { nm: '에메랄드', color: '#10b981', fg: '#ffffff' },
  { nm: '에메랄드 · 밝음', color: '#34d399', fg: '#064e3b' },
  { nm: '에메랄드 · 옅음', color: '#6ee7b7', fg: '#064e3b' },
  { nm: '에메랄드 · 여림', color: '#d1fae5', fg: '#064e3b' },

  { nm: '청록 · 아주 진함', color: '#134e4a', fg: '#ffffff' },
  { nm: '청록 · 진함', color: '#0f766e', fg: '#ffffff' },
  { nm: '청록', color: '#0d9488', fg: '#ffffff' },
  { nm: '청록 · 밝음', color: '#2dd4bf', fg: '#134e4a' },
  { nm: '청록 · 옅음', color: '#5eead4', fg: '#134e4a' },
  { nm: '청록 · 여림', color: '#ccfbf1', fg: '#134e4a' },

  { nm: '하늘 · 아주 진함', color: '#0c4a6e', fg: '#ffffff' },
  { nm: '하늘 · 진함', color: '#0369a1', fg: '#ffffff' },
  { nm: '하늘', color: '#0ea5e9', fg: '#ffffff' },
  { nm: '하늘 · 밝음', color: '#38bdf8', fg: '#0c4a6e' },
  { nm: '하늘 · 옅음', color: '#7dd3fc', fg: '#0c4a6e' },
  { nm: '하늘 · 여림', color: '#e0f2fe', fg: '#0c4a6e' },

  { nm: '파랑 · 아주 진함', color: '#1e3a8a', fg: '#ffffff' },
  { nm: '파랑 · 진함', color: '#1d4ed8', fg: '#ffffff' },
  { nm: '파랑', color: '#2563eb', fg: '#ffffff' },
  { nm: '파랑 · 밝음', color: '#60a5fa', fg: '#1e3a8a' },
  { nm: '파랑 · 옅음', color: '#93c5fd', fg: '#1e3a8a' },
  { nm: '파랑 · 여림', color: '#dbeafe', fg: '#1e3a8a' },

  { nm: '남색 · 아주 진함', color: '#312e81', fg: '#ffffff' },
  { nm: '남색 · 진함', color: '#4338ca', fg: '#ffffff' },
  { nm: '남색', color: '#4f46e5', fg: '#ffffff' },
  { nm: '남색 · 밝음', color: '#818cf8', fg: '#312e81' },
  { nm: '남색 · 옅음', color: '#a5b4fc', fg: '#312e81' },
  { nm: '남색 · 여림', color: '#e0e7ff', fg: '#312e81' },

  { nm: '보라 · 아주 진함', color: '#4c1d95', fg: '#ffffff' },
  { nm: '보라 · 진함', color: '#6d28d9', fg: '#ffffff' },
  { nm: '보라', color: '#7c3aed', fg: '#ffffff' },
  { nm: '보라 · 밝음', color: '#a78bfa', fg: '#4c1d95' },
  { nm: '보라 · 옅음', color: '#c4b5fd', fg: '#4c1d95' },
  { nm: '보라 · 여림', color: '#ede9fe', fg: '#4c1d95' },

  { nm: '자주 · 아주 진함', color: '#701a75', fg: '#ffffff' },
  { nm: '자주 · 진함', color: '#a21caf', fg: '#ffffff' },
  { nm: '자주', color: '#c026d3', fg: '#ffffff' },
  { nm: '자주 · 밝음', color: '#e879f9', fg: '#701a75' },
  { nm: '자주 · 옅음', color: '#f0abfc', fg: '#701a75' },
  { nm: '자주 · 여림', color: '#fae8ff', fg: '#701a75' },

  { nm: '분홍 · 아주 진함', color: '#831843', fg: '#ffffff' },
  { nm: '분홍 · 진함', color: '#be185d', fg: '#ffffff' },
  { nm: '분홍', color: '#ec4899', fg: '#ffffff' },
  { nm: '분홍 · 밝음', color: '#f472b6', fg: '#831843' },
  { nm: '분홍 · 옅음', color: '#f9a8d4', fg: '#831843' },
  { nm: '분홍 · 여림', color: '#fce7f3', fg: '#831843' },

  { nm: '장미 · 아주 진함', color: '#881337', fg: '#ffffff' },
  { nm: '장미 · 진함', color: '#be123c', fg: '#ffffff' },
  { nm: '장미', color: '#e11d48', fg: '#ffffff' },
  { nm: '장미 · 밝음', color: '#fb7185', fg: '#881337' },
  { nm: '장미 · 옅음', color: '#fda4af', fg: '#881337' },
  { nm: '장미 · 여림', color: '#ffe4e6', fg: '#881337' },

  { nm: '갈색 · 아주 진함', color: '#451a03', fg: '#ffffff' },
  { nm: '갈색 · 진함', color: '#78350f', fg: '#ffffff' },
  { nm: '갈색', color: '#a16207', fg: '#ffffff' },
  { nm: '갈색 · 밝음', color: '#c8a06a', fg: '#451a03' },
  { nm: '갈색 · 옅음', color: '#d6bd9a', fg: '#451a03' },
  { nm: '갈색 · 여림', color: '#f5ecdf', fg: '#451a03' },

  { nm: '회색 · 아주 진함', color: '#111827', fg: '#ffffff' },
  { nm: '회색 · 진함', color: '#374151', fg: '#ffffff' },
  { nm: '회색', color: '#6b7280', fg: '#ffffff' },
  { nm: '회색 · 밝음', color: '#9ca3af', fg: '#111827' },
  { nm: '회색 · 옅음', color: '#c3cad4', fg: '#111827' },
  { nm: '회색 · 여림', color: '#f1f5f9', fg: '#111827' },

  { nm: '검정', color: '#000000', fg: '#ffffff' },
  { nm: '흰색', color: '#ffffff', fg: '#1f2733' },
]

/** 한 색 고르개 — 바탕과 글자를 **따로** 고른다(지시). 누르면 색 한 벌이
    뜨고, 세밀히 잡고 싶으면 아래 칸으로 직접 집는다. */
export function ColorPick({
  title,
  value,
  onPick,
}: {
  title: string
  value: string
  onPick: (c: string) => void
}) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  /**
   * 판은 **화면 맨 위에 띄운다**(지시: 카드 아래로 숨는다).
   *
   * 카드 안에 붙여 두었더니 설정 화면의 스크롤 상자(overflow)가 잘라 먹어
   * 판이 카드 밑으로 사라졌다. 몸통(body)에 붙이고 단추 자리를 재서 그
   * 아래에 놓는다 — 어떤 상자에도 안 갇힌다. 아래가 좁으면 위로 띄운다.
   */
  const at = (() => {
    const r = btn.current?.getBoundingClientRect()
    if (!r) return { left: 0, top: 0 }
    const W = 420
    const H = 460
    const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8))
    const below = window.innerHeight - r.bottom
    const top = below > H + 12 ? r.bottom + 6 : Math.max(8, r.top - H - 6)
    return { left, top }
  })()
  return (
    <span className="vd-pick">
      <button
        ref={btn}
        type="button"
        className="vd-pickb one"
        title={`${title} — 누르면 색 한 벌이 뜹니다`}
        onClick={() => setOpen((v) => !v)}
      >
        <i style={{ background: value }} />
        <em>{value.toUpperCase()}</em>
      </button>
      {open &&
        createPortal(
          <>
            <span className="vd-pickback" onClick={() => setOpen(false)} />
            <span className="vd-pickpop" style={{ left: at.left, top: at.top }}>
            <b>{title}</b>
            {/* 계열마다 한 줄 — 왼쪽이 진하고 오른쪽이 여리다(지시:
                아이콘을 줄이고 전체가 한 번에 보이게). 이름을 왼쪽에 적어
                무슨 색 줄인지 훑어 내려갈 수 있다 */}
            <span className="vd-fams">
              {FAMS.map((f) => (
                <span className="vd-fam" key={f.nm}>
                  <em>{f.nm}</em>
                  <span className="vd-famrow">
                    {f.list.map((p) => (
                      <button
                        key={p.color}
                        type="button"
                        title={p.nm}
                        className={`vd-sw3${p.color.toLowerCase() === value.toLowerCase() ? ' on' : ''}`}
                        style={{ background: p.color }}
                        onClick={() => {
                          onPick(p.color)
                          setOpen(false)
                        }}
                      />
                    ))}
                  </span>
                </span>
              ))}
            </span>
            <span className="vd-fine">
              <label>
                직접 고르기
                <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
              </label>
            </span>
            </span>
          </>,
          document.body,
        )}
    </span>
  )
}

/** 계열별로 묶은 것 — 이름의 「 · 」 앞이 계열이다 */
const FAMS: Array<{ nm: string; list: Array<{ nm: string; color: string; fg: string }> }> = (() => {
  const m = new Map<string, Array<{ nm: string; color: string; fg: string }>>()
  for (const p of PALETTE) {
    const fam = p.nm.split(' · ')[0] ?? p.nm
    const arr = m.get(fam) ?? []
    arr.push(p)
    m.set(fam, arr)
  }
  return [...m.entries()].map(([nm, list]) => ({ nm, list }))
})()

export { PALETTE }
