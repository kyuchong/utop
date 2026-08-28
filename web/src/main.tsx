import { Component, StrictMode, type ReactNode } from 'react'
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

/**
 * 백지는 오류를 숨긴다.
 *
 * 화면 어딘가가 그리다 죽으면 React 는 전부 걷어 내고, 사람에게는 바탕색만
 * 남는다(지적: 이상한 페이지·그래도 안 된다). 죽은 까닭은 콘솔에만 찍히는데,
 * 그것을 열어 볼 사람은 없다. 오류 글자를 **화면에** 낸다 — 그 한 줄이
 * 있어야 고칠 수 있다.
 */
class Boundary extends Component<{ children: ReactNode }, { err: string }> {
  state = { err: '' }
  static getDerivedStateFromError(e: unknown) {
    return { err: e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e) }
  }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#8a1f24' }}>
        <b>화면이 그리다 멈췄습니다 — 아래 글을 그대로 전달해 주세요.</b>
        {'\n\n' + this.state.err.slice(0, 2000)}
        {'\n\n'}
        <button type="button" onClick={() => { localStorage.removeItem('utop.page'); window.location.href = window.location.pathname }}>
          기억 지우고 처음부터 열기
        </button>
      </div>
    )
  }
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Boundary>
      <App />
    </Boundary>
    </QueryClientProvider>
  </StrictMode>,
)
