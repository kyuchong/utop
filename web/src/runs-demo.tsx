import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Runs from '@/pages/Runs'
import '@/theme.css'

/** 진짜 Runs 화면 — 서버는 시험이 가로채 흉내 낸다 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Runs me={{ username: 'admin', name: '관리자', role: 'admin' }} />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
