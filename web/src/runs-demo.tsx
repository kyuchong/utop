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
      {/* 진짜 화면의 <main class="main"> 과 같은 여백·바탕 — 카드가 떠 보이는지
          여기서 봐야 실제와 같다 */}
      <div
        className="main"
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '4px 4px 12px',
          background: '#eef3f4',
          boxSizing: 'border-box',
        }}
      >
        <Runs me={{ username: 'admin', name: '관리자', role: 'admin' }} />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
