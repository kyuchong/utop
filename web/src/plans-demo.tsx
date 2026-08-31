import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Cycles from '@/pages/Cycles'
import '@/theme.css'
import '@/pages/Cycles.css'

/**
 * **진짜 Plans 화면**을 띄우는 개발 하니스 — 서버는 시험이 가로채 흉내 낸다.
 * 부품만 띄우면 서버 왕복에서 나는 버그가 안 잡힌다(여러 번 겪었다).
 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Cycles me={{ username: 'admin', name: '관리자', role: 'admin' }} />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
