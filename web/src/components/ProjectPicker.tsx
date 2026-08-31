import { useEffect, useRef, useState } from 'react'
import { prefGet, prefSet, prefRemove } from '@/lib/prefs'
import { IconChevron } from '@/components/icons'
import { useQuery } from '@tanstack/react-query'
import { projectApi } from '@/api/client'
import NewProjectDialog from '@/components/NewProjectDialog'
import './ProjectPicker.css'

/** 고른 프로젝트를 기억해 둔다 — 새로고침마다 다시 고르게 할 수는 없다 */
const KEY = 'utop.project'

/**
 * 지금 고른 프로젝트들의 cat_id. 빈 배열이면 **전체**다.
 *
 * 여럿을 고를 수 있다(지시) — 같은 장비의 두 모델을 나란히 보고 싶은 일이
 * 잦다. 「전체」 는 고르기가 아니라 **비우기**라, 다른 것과 함께 고를 수 없다.
 */
export function currentProjects(): string[] {
  return (prefGet(KEY) || '').split(',').filter(Boolean)
}

/** 옛 부름 — 첫 번째 하나만. 새 화면은 currentProjects 를 쓴다 */
export function currentProject(): string {
  return currentProjects()[0] ?? ''
}

/** 프로젝트가 바뀌면 알린다 — 화면이 다시 그리도록 */
export function onProjectChange(f: () => void): () => void {
  const h = () => f()
  window.addEventListener('utop:project', h)
  return () => window.removeEventListener('utop:project', h)
}

/**
 * 프로젝트 고르기 — **상단 가로바**의 한 자리(지시, 사진).
 *
 * 프로젝트는 이미 있다: `project` 표와 「새 프로젝트」 창이 요구사항 트리에서
 * 쓰이고 있고, 프로젝트 하나가 **최상위 폴더 하나(`cat_id`)** 와 짝이다.
 * 여기서는 그것을 **고르는 자리**만 만든다 — 만드는 창은 이미 있는 것을
 * 그대로 부른다(두 벌이 되면 한쪽만 고치는 날이 온다).
 *
 * 고른 값은 `cat_id` 로 들고 있는다. 화면이 좁힐 때 쓰는 것이 그 값이라,
 * 프로젝트 id 를 들고 있으면 쓸 때마다 한 번 더 찾아야 한다.
 */
export default function ProjectPicker() {
  const [open, setOpen] = useState(false)
  const [mk, setMk] = useState(false)
  const [sel, setSel] = useState<string[]>(currentProjects)
  const box = useRef<HTMLDivElement>(null)

  const q = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })
  const projects = q.data?.projects ?? []
  const picked = projects.filter((p) => sel.includes(p.cat_id))

  /* 바깥을 누르면 닫는다 — 메뉴가 열린 채 남아 있으면 뒤가 안 눌린다 */
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  /**
   * 고르기 — 프로젝트는 **여닫이**(누르면 켜고 끈다), 「전체」 는 비우기.
   *
   * 여럿 고르는 중에 메뉴가 닫히면 하나 고를 때마다 다시 열어야 한다.
   * 그래서 프로젝트를 누를 땐 열어 둔다. 「전체」 는 더 고를 것이 없으니 닫는다.
   */
  const pick = (catId: string) => {
    const next = !catId
      ? []
      : sel.includes(catId)
        ? sel.filter((x) => x !== catId)
        : [...sel, catId]
    setSel(next)
    if (next.length) prefSet(KEY, next.join(','))
    else prefRemove(KEY)
    if (!catId) setOpen(false)
    window.dispatchEvent(new Event('utop:project'))
  }

  return (
    <div className="prjp" ref={box}>
      <button type="button" className="prjp-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="prjp-ico" aria-hidden="true">
          ▣
        </span>
        <span className="prjp-nm">
          {picked.length === 0
            ? '전체 프로젝트'
            : picked.length === 1
              ? picked[0]!.name
              : `${picked[0]!.name} 외 ${picked.length - 1}`}
        </span>
        {/* 꺾쇠는 **오른쪽 끝**에(지시·Testiny). 이름 바로 뒤에 붙어 있으면
            이름이 길고 짧음에 따라 자리가 옮겨 다녀, 누를 곳을 눈으로 다시
            찾아야 한다. 문자 ▾ 는 글꼴마다 크기가 제각각이라 도형으로 그린다. */}
        <span className={`prjp-caret${open ? ' open' : ''}`} aria-hidden="true">
          <IconChevron />
        </span>
      </button>

      {open && (
        <div className="prjp-menu" role="menu">
          <button type="button" className={`prjp-item${sel.length === 0 ? ' on' : ''}`} onClick={() => pick('')}>
            {/* 네모 기호 대신 **진짜 체크박스**(지시) — 지금 무엇을 고른
                것인지 기호로 짐작하지 않아도 된다. 고르는 것은 단추가 맡으니
                이 칸은 표시만 한다. */}
            <input type="checkbox" className="prjp-chk" checked={sel.length === 0} readOnly tabIndex={-1} />
            전체 프로젝트
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`prjp-item${sel.includes(p.cat_id) ? ' on' : ''}`}
              onClick={() => pick(p.cat_id)}
              title={[p.customer, p.model_group].filter(Boolean).join(' · ')}
            >
              <input
                type="checkbox"
                className="prjp-chk"
                checked={sel.includes(p.cat_id)}
                readOnly
                tabIndex={-1}
              />
              <span className="prjp-itnm">{p.name}</span>
              <span className="prjp-sub">{[p.model_group].filter(Boolean).join(' / ')}</span>
            </button>
          ))}
          {!projects.length && !q.isLoading && <div className="prjp-empty">프로젝트가 없습니다</div>}

          <div className="prjp-sep" />
          {/* 만드는 창은 **이미 있는 것**을 그대로 부른다 */}
          <button type="button" className="prjp-item" onClick={() => { setOpen(false); setMk(true) }}>
            <span className="prjp-ico">＋</span> 새 프로젝트 만들기
          </button>
        </div>
      )}

      {mk && (
        <NewProjectDialog
          onClose={() => setMk(false)}
          onCreated={(catId) => {
            setMk(false)
            void q.refetch()
            pick(catId)
          }}
        />
      )}
    </div>
  )
}
