import { useEffect, useRef, useState } from 'react'
import { IconChevron } from '@/components/icons'
import { useQuery } from '@tanstack/react-query'
import { projectApi } from '@/api/client'
import NewProjectDialog from '@/components/NewProjectDialog'
import './ProjectPicker.css'

/** 고른 프로젝트를 기억해 둔다 — 새로고침마다 다시 고르게 할 수는 없다 */
const KEY = 'utop.project'

/** 지금 고른 프로젝트의 cat_id (없으면 '' = 전체). 화면들이 이걸로 좁힌다 */
export function currentProject(): string {
  return localStorage.getItem(KEY) || ''
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
  const [sel, setSel] = useState(currentProject)
  const box = useRef<HTMLDivElement>(null)

  const q = useQuery({ queryKey: ['projects'], queryFn: ({ signal }) => projectApi.list(signal) })
  const projects = q.data?.projects ?? []
  const cur = projects.find((p) => p.cat_id === sel)

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

  const pick = (catId: string) => {
    setSel(catId)
    if (catId) localStorage.setItem(KEY, catId)
    else localStorage.removeItem(KEY)
    setOpen(false)
    window.dispatchEvent(new Event('utop:project'))
  }

  return (
    <div className="prjp" ref={box}>
      <button type="button" className="prjp-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="prjp-ico" aria-hidden="true">
          ▣
        </span>
        <span className="prjp-nm">{cur?.name || '전체 프로젝트'}</span>
        {/* 꺾쇠는 **오른쪽 끝**에(지시·Testiny). 이름 바로 뒤에 붙어 있으면
            이름이 길고 짧음에 따라 자리가 옮겨 다녀, 누를 곳을 눈으로 다시
            찾아야 한다. 문자 ▾ 는 글꼴마다 크기가 제각각이라 도형으로 그린다. */}
        <span className={`prjp-caret${open ? ' open' : ''}`} aria-hidden="true">
          <IconChevron />
        </span>
      </button>

      {open && (
        <div className="prjp-menu" role="menu">
          <button type="button" className={`prjp-item${sel === '' ? ' on' : ''}`} onClick={() => pick('')}>
            {/* 네모 기호 대신 **진짜 체크박스**(지시) — 지금 무엇을 고른
                것인지 기호로 짐작하지 않아도 된다. 고르는 것은 단추가 맡으니
                이 칸은 표시만 한다. */}
            <input type="checkbox" className="prjp-chk" checked={sel === ''} readOnly tabIndex={-1} />
            전체 프로젝트
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`prjp-item${p.cat_id === sel ? ' on' : ''}`}
              onClick={() => pick(p.cat_id)}
              title={[p.customer, p.model_group, p.model].filter(Boolean).join(' · ')}
            >
              <input
                type="checkbox"
                className="prjp-chk"
                checked={p.cat_id === sel}
                readOnly
                tabIndex={-1}
              />
              <span className="prjp-itnm">{p.name}</span>
              <span className="prjp-sub">{[p.model_group, p.model].filter(Boolean).join(' / ')}</span>
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
