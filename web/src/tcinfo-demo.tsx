import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TcInfo from '@/components/tc/TcInfo'
import '@/theme.css'
import '@/pages/TestCases.css'

/** 진짜 Info 탭 — 서버는 시험이 가로채 흉내 낸다 */
function Harness() {
  const [d, setD] = useState<Record<string, unknown>>({
    tcid: 'E61xx_T0002', name: 'sysDescr ( OID-1.3.6.1.2.1.1 ) Get 동작 확인',
    req_id: 'req-1', status: '작성중', run_type: 'A', severity: 'MJ',
    type: '기능', origin: '자체', model_group: 'E61xx', model: 'E6100',
    custom: { perf: 'Performance' },
    created_by: '관리자', created_at: '2026-08-02T06:46', updated_by: '관리자', updated_at: '2026-08-31T09:24',
  })
  return <TcInfo data={d as never} onChange={(p) => setD((x) => ({ ...x, ...p }))} />
}
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><Harness /></QueryClientProvider></StrictMode>,
)
