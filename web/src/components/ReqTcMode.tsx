import { useEffect, useState } from 'react'
import './ReqTcMode.css'

/**
 * REQ-Coverage 가 무엇을 세고 있나 — 요구사항인가, 시험항목인가.
 *
 * 이 토글이 **상단바**로 올라갔다(지시). 그러면 값을 화면 밖에서도 알아야
 * 하므로, 프로젝트 고르기와 **같은 방식**을 쓴다: localStorage 에 담고
 * 바뀌면 알린다. 상태를 React 위쪽으로 끌어올리면 그 사이 화면들이 전부
 * 이 값을 알아야 하는데, 정작 쓰는 곳은 두 곳뿐이다.
 */
const KEY = 'utop.reqtc.mode'

export type ReqTcMode = 'req' | 'tc'

export function currentMode(): ReqTcMode {
  return localStorage.getItem(KEY) === 'tc' ? 'tc' : 'req'
}

export function setMode(m: ReqTcMode): void {
  localStorage.setItem(KEY, m)
  window.dispatchEvent(new Event('utop:reqtcmode'))
}

export function onModeChange(f: () => void): () => void {
  const h = () => f()
  window.addEventListener('utop:reqtcmode', h)
  return () => window.removeEventListener('utop:reqtcmode', h)
}

/** 상단바에 서는 토글 — 프로젝트 고르기 오른쪽, 세로선 너머 */
export default function ReqTcModeToggle() {
  const [m, setM] = useState<ReqTcMode>(currentMode)
  useEffect(() => onModeChange(() => setM(currentMode())), [])
  const pick = (v: ReqTcMode) => {
    setM(v)
    setMode(v)
  }
  return (
    <div className="rtm" role="group" aria-label="무엇을 볼지">
      <button type="button" className={m === 'req' ? 'on' : ''} onClick={() => pick('req')}>
        Requirements
      </button>
      <button type="button" className={m === 'tc' ? 'on' : ''} onClick={() => pick('tc')}>
        Coverage
      </button>
    </div>
  )
}
