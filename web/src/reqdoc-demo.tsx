import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ReqDetail from '@/components/ReqDetail'
import '@/theme.css'
import '@/pages/ReqTc.css'

/** 팝업과 **같은 그릇**(.rqtc-popbody — 그냥 스크롤 상자)에 넣어 본다 */
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="rqtc-popbody">
          <ReqDetail
            req={{ id: 'r1', reqid: 'E61xx_R0007', title: 'Spec', desc: '' } as never}
            tcs={[] as never}
            tab="detail"
          />
        </div>
      </div>
    </QueryClientProvider>
  </StrictMode>,
)
