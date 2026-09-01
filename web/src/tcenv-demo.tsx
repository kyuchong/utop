import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TcEnv from '@/components/tc/TcEnv'
import TcManual from '@/components/tc/TcManual'
import '@/theme.css'
import '@/components/tc/tc.css'

function H() {
  const [d, setD] = useState<Record<string, unknown>>({
    tcid: 'E61xx_T0002', name: '습도 시험',
    purpose: '비동작 상태에서 상대 습도 환경에 장비가 노출되었을 때…',
    precondition: '- 시험 대상 장비 준비', checks: [], steps: [],
  })
  const on = (p: Record<string, unknown>) => setD((x) => ({ ...x, ...p }))
  return (
    <>
      <TcEnv data={d as never} onChange={on as never} />
      <TcManual data={d as never} onChange={on as never} />
    </>
  )
}
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><H /></QueryClientProvider></StrictMode>,
)
