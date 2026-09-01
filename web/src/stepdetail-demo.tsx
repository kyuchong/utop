import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TcStepDetail from '@/components/tc/TcStepDetail'
import type { TcStep } from '@/components/tc/types'
import '@/theme.css'
import '@/pages/TestCases.css'

/** 진짜 스텝 상세 — 「명령 뒤 대기」 칸이 실제로 그려지는지 본다 */
function Demo() {
  const [step, setStep] = useState<TcStep>({
    id: 's1',
    kind: 'cli',
    cli: 'show system',
    desc: 'show system',
  } as TcStep)
  return (
    <div style={{ padding: 16, maxWidth: 780 }}>
      <TcStepDetail
        step={step}
        index={0}
        total={1}
        sessions={[]}
        params={{ values: {}, items: [], loading: false, empty: "" }}
        takenVars={[]}
        onChange={(p) => setStep((s) => ({ ...s, ...p }))}
        onMove={() => {}}
        onRemove={() => {}}
        onDuplicate={() => {}}
      />
      <pre id="dump" style={{ marginTop: 12, fontSize: 12 }}>
        tailWait = {JSON.stringify(step.tailWait)}
      </pre>
    </div>
  )
}
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <Demo />
    </QueryClientProvider>
  </StrictMode>,
)
