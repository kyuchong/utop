import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/components/Login'
import { authApi, getToken, setToken, type MeUser } from '@/api/client'
import { useLiveRefresh } from '@/components/useLiveRefresh'
import { useFreshBuild } from '@/components/useFreshBuild'
import { goto, onGoto as onGotoEvent, reflectUrl } from '@/api/goto'
import Dashboard from '@/pages/Dashboard'
import ReqTc from '@/pages/ReqTc'
import Wiki from '@/pages/Wiki'
import Settings from '@/pages/Settings'
import AiTc from '@/pages/AiTc'
import Cycles from '@/pages/Cycles'
import Defects from '@/pages/Defects'
import Devices from '@/pages/Devices'
import Instruments from '@/pages/Instruments'
import RackView from '@/pages/RackView'

/**
 * 화면 하나를 옮길 때마다 여기 분기를 한 줄 늘린다.
 * 아직 안 옮긴 메뉴는 안내만 띄운다 — 기존 앱(8000 포트)에 그대로 남아 있다.
 */
const PAGE_KEY = 'utop.page'

export default function App() {
  // 새로고침해도 보던 화면으로 돌아온다. 장비를 등록하다 새로고침했는데
  // 요구사항으로 튕기면 다시 찾아 들어가야 한다.
  const [page, setPage] = useState(() => {
    try {
      return localStorage.getItem(PAGE_KEY) || 'requirements'
    } catch {
      return 'requirements'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, page)
    } catch {
      /* 사생활 보호 모드에서 저장이 막혀도 화면은 돌아야 한다 */
    }
  }, [page])
  // undefined = 확인 중 / null = 로그인 필요
  const [user, setUser] = useState<MeUser | null | undefined>(undefined)

  // 저장된 토큰이 아직 살아 있는지 확인한다. 만료됐는데 앱을 띄우면
  // 모든 호출이 401 로 떨어져서 화면이 텅 빈 채로 남는다.
  useEffect(() => {
    if (!getToken()) {
      setUser(null)
      return
    }
    authApi
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  /**
   * 주소로 들어온 부탁 — `?tc=U-…`.
   *
   * 새 탭에서 링크를 열면 이 창은 처음부터 시작한다. 기억해 둔 화면이
   * 아니라 **주소가 가리키는 것**부터 보여야 한다. 읽은 뒤 주소는
   * 지운다 — 남겨 두면 새로 고칠 때마다 같은 곳으로 되돌아가, 그 뒤에
   * 무엇을 열어 두었든 없던 일이 된다.
   */
  useEffect(() => {
    const kinds = [
      ['tc', 'utop.tc.open', 'reqtc'],
      ['req', 'utop.req.sel', 'reqtc'],
      // ?ce=CE-2633-002 — 실행 링크. cycle 보다 앞이라 둘 다 있으면 ce 가 이긴다
      ['ce', 'utop.cycle.ce', 'cycles'],
      ['cycle', 'utop.cycle.sel', 'cycles'],
      ['report', 'utop.report.cycle', 'executions'],
      /* ?cat=cat-… — REQ-Coverage 의 폴더 링크. 「지금 보는 이 자리」 를
         그대로 보내려면 폴더도 주소가 있어야 한다(지시: 링크 복사). */
      ['cat', 'utop.reqtc.cat', 'reqtc'],
      /* ?wiki=wk-… — 위키 문서 링크. 문서끼리 짚은 자리를 눌렀을 때와
         남에게 보낸 주소가 같은 길로 열린다 */
      ['wiki', 'utop.wiki.open', 'wiki'],
    ] as const
    /*
     * 주소를 **지우지 않는다.** 전에는 읽고 바로 지웠는데, 그러면 주소창이
     * 늘 IP 뿐이라 지금 보는 것을 남에게 보낼 수가 없었다. 옛 화면이
     * `#cycle=…` 로 하던 그 일이다. 뒤로가기도 이 주소들을 따라간다.
     */
    const apply = () => {
      const p = new URLSearchParams(window.location.search)
      for (const [key, store, to] of kinds) {
        const id = p.get(key)
        if (!id) continue
        try {
          localStorage.setItem(store, id)
        } catch {
          /* 사생활 보호 모드 */
        }
        setPage(to)
        // 이미 그 화면에 있으면 페이지 전환이 안 일어난다 — 화면 안
        // 선택은 goto 알림이 맡는다(각 화면이 듣는다).
        goto(key, id)
        break
      }
    }
    apply()
    window.addEventListener('popstate', apply)
    return () => window.removeEventListener('popstate', apply)
  }, [])

  // 남이 바꾼 것을 어느 화면에 있든 바로 들여온다. 화면마다 따로 붙이면
  // 또 어느 하나가 빠지므로 여기 한 곳에서 듣는다.
  useLiveRefresh()

  /*
   * 이 화면이 옛 판인가.
   *
   * 서버를 새로 올려도 브라우저는 받아 둔 파일을 계속 쓴다. 그래서 한
   * 사람은 새 화면, 한 사람은 옛 화면을 보고 — 자료는 하나뿐인데 —
   * 서로 다른 수를 읽는다. 20줄과 200줄이 그렇게 갈렸다.
   */
  const staleBuild = useFreshBuild()

  // 다른 화면의 것을 열어 달라는 부탁 (사이클에서 TC ID 를 누른 것 따위)
  useEffect(
    () =>
      onGotoEvent((kind, id) => {
        reflectUrl(kind, id)
        if (kind === 'tc') {
          localStorage.setItem('utop.tc.open', id)
          setPage('testcases')
        } else if (kind === 'cycle') {
          localStorage.setItem('utop.cycle.sel', id)
          setPage('cycles')
        } else if (kind === 'report') {
          // 지나간 실행을 시간순으로 보는 화면. 어느 회차에서 왔는지 남겨
          // 그 화면이 그것부터 보여 줄 수 있게 한다.
          localStorage.setItem('utop.report.cycle', id)
          setPage('executions')
        } else {
          localStorage.setItem('utop.req.sel', id)
          setPage('requirements')
        }
      }),
    [],
  )

  if (user === undefined) return <div className="empty">확인 중…</div>
  if (user === null) return <Login onDone={setUser} />

  return (
    <>
      {staleBuild && (
        <div className="stale-build">
          새 판이 올라왔습니다 — 지금 화면은 옛 판이라 값이 다르게 보일 수 있습니다.
          <button type="button" onClick={() => window.location.reload()}>
            새로 고치기
          </button>
        </div>
      )}
    <Layout
      user={user}
      onLogout={() => {
        void authApi.logout()
        setToken('')
        setUser(null)
      }}
      current={page}
      onNavigate={(k) => {
        // 메뉴로 화면을 옮기면 주소의 딥링크(?cycle=… 등)는 걷어낸다.
        // 남겨 두면 다른 화면에서 새로고침해도 그 링크가 이겨서
        // 사이클로 끌려간다(겪었다).
        if (window.location.search)
          window.history.replaceState({}, '', window.location.pathname)
        setPage(k)
      }}
    >
      {page === 'dashboard' ? (
        <Dashboard onNav={(k) => setPage(k)} />
      ) : page === 'reqtc' ? (
        <ReqTc me={user} />
      ) : page === 'wiki' ? (
        <Wiki />
      ) : page === 'ai-tc' ? (
        <AiTc />
      ) : page === 'cycles' ? (
        <Cycles me={user} />
      ) : page === 'executions' ? (
        /* 옛 Reports 자리 — 북마크로 들어오면 사이클 화면을 보여 준다 */
        <Cycles me={user} />
      ) : page === 'defects' ? (
        <Defects />
      ) : page === 'devices' ? (
        <Devices me={user} />
      ) : page === 'instruments' ? (
        <Instruments me={user} />
      ) : page === 'rackview' ? (
        <RackView />
      ) : page === 'settings' ? (
        <Settings />
      ) : (
        <div className="empty">
          이 화면은 아직 새 UI로 옮기지 않았습니다.
          <br />
          기존 화면에서 계속 사용할 수 있습니다.
        </div>
      )}
    </Layout>
    </>
  )
}
