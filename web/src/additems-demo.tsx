import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CycleEdit from '@/components/cycle/CycleEdit'
import '@/theme.css'
import '@/pages/Cycles.css'

/** 진짜 「항목 추가」 팝업 — 서버는 시험이 가로채 흉내 낸다 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <CycleEdit
        cycleId="P1"
        folders={{}}
        popupOnly
        onClose={() => {}}
        onDone={() => {}}
      />
    </QueryClientProvider>
  </StrictMode>,
)
