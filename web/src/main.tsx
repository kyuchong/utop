import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '@/App'
import '@/theme.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

const root = document.getElementById('root')
if (!root) throw new Error('#root 를 찾을 수 없습니다')

/*
 * 배포가 도는 사이에 열린 창은 **이미 사라진 조각 파일**을 부르다 멈춘다 —
 * 번들 이름에 해시가 붙어, 새 판이 올라가면 옛 이름은 404 다. 화면은
 * 바탕색만 남은 백지가 된다(지적).
 *
 * Vite 가 그 순간에 이 신호를 내 준다. 새로 고치면 새 index.html 이 새
 * 이름을 가리키므로 그대로 살아난다. 한 번만 시도한다 — 서버가 정말 죽어
 * 있으면 새로 고침이 무한히 돌기 때문이다.
 */
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'utop.reloaded-for-chunk'
  if (sessionStorage.getItem(KEY)) return
  sessionStorage.setItem(KEY, '1')
  e.preventDefault()
  window.location.reload()
})
window.addEventListener('load', () => sessionStorage.removeItem('utop.reloaded-for-chunk'))

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
