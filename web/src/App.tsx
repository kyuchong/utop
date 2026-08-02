import { useState } from 'react'
import Layout from '@/components/Layout'
import Requirements from '@/pages/Requirements'
import TestCases from '@/pages/TestCases'

/**
 * 화면 하나를 옮길 때마다 여기 분기를 한 줄 늘린다.
 * 아직 안 옮긴 메뉴는 안내만 띄운다 — 기존 앱(8000 포트)에 그대로 남아 있다.
 */
export default function App() {
  const [page, setPage] = useState('requirements')

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
