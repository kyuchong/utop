import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CyclePlan from '@/components/cycle/CyclePlan'
import '@/theme.css'
import '@/pages/Cycles.css'

const CY = {
  id: 'cy1', cid: 'E61xx_P0001', name: 'test', customer: 'LGPU', model: 'E6100',
  model_group: 'E61xx', version: 'R100_2026_08_31', version_group: 'R100',
  items: [
    { tcid: 'E61xx_T0033', ceid: 'CETC-1', req_id: 'r1', name: 'ubiMemoryAlloc Get 동작 확인' },
    { tcid: 'E61xx_T0034', ceid: 'CETC-2', req_id: 'r1', name: 'ubiCpuFiveSec Get 동작 확인' },
    { tcid: 'E61xx_T0030', ceid: 'CETC-3', req_id: 'r1', name: 'ubiMemoryThreshold Get 동작 확인' },
    { tcid: 'E61xx_T0057', ceid: 'CETC-4', req_id: 'r1', name: 'ifSpeed Get 동작 확인' },
  ],
}
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <CyclePlan
          mode="plan"
          cycles={[CY] as never}
          onBack={() => {}}
          onExec={() => {}}
          famOf={new Map()}
          mgroupOf={new Map()}
          meName="관리자"
          onEdit={() => {}}
          onAddItems={() => {}}
          onRun={() => {}}
          onReport={() => {}}
          onInsight={() => {}}
          onCsv={() => {}}
          onDup={() => {}}
          onDel={() => {}}
          running={new Map()}
          onRefresh={() => {}}
        />
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
