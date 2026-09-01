import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Devices from '@/pages/Devices'
import '@/theme.css'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Devices me={{ username: 'admin', name: '관리자', role: 'admin' } as never} />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
