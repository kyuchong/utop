import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Releases from '@/pages/Releases'
import '@/theme.css'

/** 진짜 Releases 화면 — 서버는 시험이 가로채 흉내 낸다 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', padding: 4, background: '#eef3f4', boxSizing: 'border-box' }}>
        <Releases />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
