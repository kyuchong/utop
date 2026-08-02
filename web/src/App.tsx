import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/components/Login'
import { authApi, getToken, type MeUser } from '@/api/client'
import Requirements from '@/pages/Requirements'
import TestCases from '@/pages/TestCases'

/**
 * 화면 하나를 옮길 때마다 여기 분기를 한 줄 늘린다.
 * 아직 안 옮긴 메뉴는 안내만 띄운다 — 기존 앱(8000 포트)에 그대로 남아 있다.
 */
export default function App() {
  const [page, setPage] = useState('requirements')
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

  if (user === undefined) return <div className="empty">확인 중…</div>
  if (user === null) return <Login onDone={setUser} />

  return (
    <Layout current={page} onNavigate={setPage}>
      {page === 'requirements' ? (
        <Requirements />
      ) : page === 'testcases' ? (
        <TestCases />
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
