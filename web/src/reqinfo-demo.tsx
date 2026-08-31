import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReqDetail from '@/components/ReqDetail'
import '@/theme.css'
import '@/pages/Requirements.css'

function Harness() {
  const [d, setD] = useState({ title: 'SNMPv2 Public - System', status: '검토중', priority: 'MJ' })
  const req = {
    id: 'req-1', reqid: 'E61xx_R0007', title: d.title, status: d.status, priority: d.priority,
    cat1: 'c1', cat2: 'c2', created_by: '관리자', created_at: '2026-08-02T06:46',
    updated_by: '관리자', updated_at: '2026-08-31T09:24',
  }
  const tcs = [
    { tcid: 'E61xx_T0002', name: 'sysDescr ( OID-1.3.6.1.2.1.1 ) Get 동작 확인', status: 'PASS' },
    { tcid: 'E61xx_T0017', name: 'sysName Get 동작 확인', status: '작성중' },
  ]
  return (
    <ReqDetail
      req={req as never}
      tcs={tcs as never}
      tab="info"
      edit={{
        title: d.title, status: d.status, priority: d.priority,
        statuses: ['작성중', '검토중', '승인'], priorities: ['MJ', 'MN', 'CR'],
        onChange: (p) => setD((x) => ({ ...x, ...p })),
      }}
    />
  )
}
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><Harness /></QueryClientProvider></StrictMode>,
)
