import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/components/Login'
import { authApi, getToken, setToken, type MeUser } from '@/api/client'
import { useLiveRefresh } from '@/components/useLiveRefresh'
import { onGoto as onGotoEvent } from '@/api/goto'
import Requirements from '@/pages/Requirements'
import TestCases from '@/pages/TestCases'
import Settings from '@/pages/Settings'
import AiTc from '@/pages/AiTc'
import Cycles from '@/pages/Cycles'
import Reports from '@/pages/Reports'
import Defects from '@/pages/Defects'
import Devices from '@/pages/Devices'
import Instruments from '@/pages/Instruments'

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

  // 남이 바꾼 것을 어느 화면에 있든 바로 들여온다. 화면마다 따로 붙이면
  // 또 어느 하나가 빠지므로 여기 한 곳에서 듣는다.
  useLiveRefresh()

  // 다른 화면의 것을 열어 달라는 부탁 (사이클에서 TC ID 를 누른 것 따위)
  useEffect(
    () =>
      onGotoEvent((kind, id) => {
        if (kind === 'tc') {
          localStorage.setItem('utop.tc.open', id)
          setPage('testcases')
        } else if (kind === 'cycle') {
          localStorage.setItem('utop.cycle.sel', id)
          setPage('cycles')
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
    <Layout
      user={user}
      onLogout={() => {
        void authApi.logout()
        setToken('')
        setUser(null)
      }}
      current={page}
      onNavigate={setPage}
    >
      {page === 'requirements' ? (
        <Requirements />
      ) : page === 'testcases' ? (
        <TestCases me={user} />
      ) : page === 'ai-tc' ? (
        <AiTc />
      ) : page === 'cycles' ? (
        <Cycles />
      ) : page === 'executions' ? (
        <Reports />
      ) : page === 'defects' ? (
        <Defects />
      ) : page === 'devices' ? (
        <Devices me={user} />
      ) : page === 'instruments' ? (
        <Instruments me={user} />
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
  )
}
