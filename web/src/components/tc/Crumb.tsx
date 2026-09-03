/**
 * 자리 줄(빵부스러기) — **세 화면이 같은 문법**을 쓴다(지시).
 *
 *   Requirement   E61xx / Requirements / Spec                             [E61xx-R0001]
 *   Coverage      E61xx / Coverage / 11.HW / Spec / Operating temperature [E61xx-T0068]
 *   Release       E61xx / Release / TC1                                   [E61xx-V0001]
 *
 * 문법은 하나다: **모델그룹 / 화면이름 / 폴더… / 제목** + 오른쪽에 ID 배지.
 * 세 곳에 따로 그리면 하루가 멀다 하고 갈린다 — 오늘 감싸개 규칙이 그렇게
 * 세 번 갈렸다. 그리는 곳을 여기 하나로 둔다.
 */
import type { ReactNode } from 'react'

/**
 * 보이는 ID — 이음쇠를 **「-」** 로(지시: 전부 `E61xx-R0001` 꼴).
 *
 * 마지막 `_R0001` 한 조각만 바꾼다. 모델그룹 이름 자체에 밑줄이 있을 수
 * 있어서(`공공_UbiEnt`) 통째로 바꾸면 앞머리까지 망가진다.
 *
 * 저장값은 「ID 옮기기」 가 바꾼다. 여기는 아직 안 옮긴 자료·옛 화면에서
 * 온 값이 섞여 들어와도 한 꼴로 보이게 하는 자리다.
 */
export function dashId(id: unknown): string {
  return String(id ?? '').replace(/_([RTVP]\d+)$/i, '-$1')
}

export default function Crumb({
  group,
  screen,
  path = [],
  name,
  id,
  onId,
  right,
}: {
  /** 모델그룹 — 모르면 안 그린다(지어내지 않는다) */
  group?: string
  /** 화면 이름 — Requirements · Coverage · Release */
  screen: string
  /** 폴더 길. 앞이 모델그룹·화면이름과 겹치면 건너뛴다 */
  path?: string[]
  /** 마지막 칸 — 요구사항·시험의 제목 */
  name?: string
  /** 오른쪽 배지에 적을 ID */
  id?: string
  /** 배지를 누르면 — 대개 「이 항목으로 가는 주소 복사」 */
  onId?: () => void
  /** 배지 뒤에 더 붙일 것 */
  right?: ReactNode
}) {
  /* 폴더 길이 이미 `E61xx > Coverage > …` 로 시작하는 자료가 있다 — 그
     앞머리를 또 그리면 같은 말이 두 번 나온다. 겹치는 만큼 건너뛴다. */
  const head = [group, screen].filter(Boolean).map((v) => String(v))
  let skip = 0
  for (const h of head) {
    if ((path[skip] ?? '').trim().toLowerCase() === h.trim().toLowerCase()) skip += 1
    else break
  }
  const segs = [...head, ...path.slice(skip), ...(name ? [name] : [])].filter(Boolean)

  return (
    <nav className="tcx-crumb" aria-label="자리">
      {segs.map((sg, i) => (
        <span className="tcx-crumbi" key={`${sg}-${i}`}>
          {i > 0 && <i className="tcx-crumbsep" aria-hidden="true">/</i>}
          <span className={i === segs.length - 1 ? 'last' : ''}>{sg}</span>
        </span>
      ))}
      {!!id && (
        <button
          type="button"
          className="tcx-crumbid"
          title={onId ? '이 항목으로 가는 주소를 복사합니다' : dashId(id)}
          onClick={onId}
          disabled={!onId}
        >
          {dashId(id)}
        </button>
      )}
      {right}
    </nav>
  )
}
