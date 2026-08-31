import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReqTc from '@/pages/ReqTc'
import '@/theme.css'
import '@/pages/ReqTc.css'
import '@/pages/Requirements.css'

/**
 * **진짜 화면**을 띄우는 개발 하니스 — 서버는 시험이 가로채 흉내 낸다.
 *
 * 부품만 띄우는 하니스로는 「저장이 끝나기 전에 화면이 되돌아가는」 종류의
 * 버그가 절대 안 잡힌다(그래서 같은 지적을 여러 번 받았다). 여기서는
 * ReqTc 가 실제로 /api/* 를 부르고, 시험이 그 응답을 준다.
 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <ReqTc me={{ username: 'admin', name: '관리자', role: 'admin' } as never} />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
