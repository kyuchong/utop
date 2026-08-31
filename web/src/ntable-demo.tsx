import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import NTable from '@/components/ntable/NTable'
import { EMPTY_VIEW, type NCalc, type NCol, type NRow, type NView } from '@/components/ntable/types'
import '@/theme.css'

/**
 * 개발 전용 하니스 — **진짜 부품**을 띄워 눌러 본다(복제 화면 금지).
 * `vite build` 는 index.html 만 담으므로 운영 빌드에는 안 들어간다.
 */
const COLS: NCol[] = [
  { key: 'id', label: 'ID', type: 'text', width: 116, fixed: true },
  { key: 'title', label: '제목', type: 'text', width: 420, fixed: true },
  { key: 'type', label: '유형', type: 'select', width: 84,
    options: [{ value: '기능', color: 'lime' }, { value: '성능', color: 'blue' }, { value: '보안', color: 'purple' }] },
  /* 상태는 **SETUP 이 준 색(hex)** 을 그대로 넣는다 — 노션 파스텔로
     바뀌어 그려지는지 진짜로 본다(설정이 정본인 규칙을 안 깨는 다리) */
  { key: 'status', label: '상태', type: 'select', width: 104,
    options: [{ value: '작성중', color: '#fdab3d' }, { value: '검토중', color: '#579bfc' },
              { value: '승인', color: '#00c875' }, { value: '보류', color: '#9ca3af' }, { value: 'Draft', color: '#e2445c' }] },
  { key: 'severity', label: '중요도', type: 'select', width: 82,
    options: [{ value: 'CR', color: 'rose' }, { value: 'MJ', color: 'orange' }, { value: 'MN', color: 'gray' }] },
  { key: 'run', label: '타입', type: 'select', width: 78,
    options: [{ value: '수동', color: 'purple' }, { value: '자동', color: 'emerald' }] },
  { key: 'who', label: '담당', type: 'person', width: 98 },
  { key: 'due', label: '목표일', type: 'date', width: 106 },
]
const ROWS: NRow[] = [
  { __id: '1', id: 'E61xx_T0084', title: '정지 팬 전원 복구 시 정상 동작 복귀 시간 측정', type: '성능', status: '작성중', severity: 'MJ', run: '수동', who: '전규종', due: '2026-09-04' },
  { __id: '2', id: 'E61xx_T0083', title: '운용 중 냉각 팬 모듈 핫스왑 교체 확인', type: '기능', status: '검토중', severity: 'MJ', run: '수동', who: '김검증', due: '2026-09-02' },
  { __id: '3', id: 'E61xx_T0082', title: '팬 정지 시 경보 통지 시간 측정', type: '성능', status: '작성중', severity: 'MJ', run: '자동', who: '전규종', due: '2026-09-05' },
  { __id: '4', id: 'E61xx_T0081', title: '팬 1개 정지 시 동작 온도 범위 내 운용 유지 확인', type: '기능', status: '승인', severity: 'CR', run: '수동', who: '박시험', due: '2026-08-30' },
  { __id: '5', id: 'E61xx_T0080', title: '냉각 팬 이중화 구성 방식 확인', type: '기능', status: '작성중', severity: 'CR', run: '자동', who: '전규종', due: '2026-09-06' },
  { __id: '6', id: 'E61xx_T0079', title: '냉각 팬 장착 수량 및 인식 상태 확인', type: '기능', status: '검토중', severity: 'MJ', run: '수동', who: '김검증', due: '' },
  { __id: '7', id: 'E61xx_T0069', title: 'Store temperature', type: '기능', status: '승인', severity: 'MJ', run: '자동', who: '박시험', due: '2026-09-08' },
  { __id: '8', id: 'E61xx_T0068', title: 'Operating temperature', type: '기능', status: 'Draft', severity: 'MJ', run: '자동', who: '전규종', due: '2026-09-08' },
]
const PEOPLE = [
  { name: '전규종', org: '검증1그룹' }, { name: '김검증', org: '검증1그룹' },
  { name: '박시험', org: '검증1그룹' }, { name: '이품질', org: '품질보증팀' },
  { name: '최자동', org: '검증2그룹' }, { name: '정계측', org: '검증2그룹' },
  { name: '한네트', org: '개발1팀' }, { name: 'utopbot', org: '' },
]

function Demo() {
  const [cols, setCols] = useState<NCol[]>(COLS)
  const [rows, setRows] = useState<NRow[]>(ROWS)
  const [view, setView] = useState<NView>({ ...EMPTY_VIEW })
  const [calc, setCalc] = useState<Record<string, NCalc>>({ status: 'filled', due: 'empty', severity: 'unique' })
  const [per, setPer] = useState(25)
  const [log, setLog] = useState<string[]>([])
  const say = (s: string) => setLog((l) => [s, ...l].slice(0, 6))
  return (
    <div style={{ padding: '18px 22px', fontFamily: "'Pretendard','Malgun Gothic',sans-serif", background: '#fff' }}>
      {/* 앱과 같은 꼴 — 표는 굴러가는 상자 안에 산다(.rqtc-tbl 처럼).
          머리줄 고정이 이 상자에 붙는지 여기서 실제로 본다 */}
      <div id="scrollbox" style={{ height: 300, overflow: 'auto', border: '1px solid #eee', borderRadius: 8 }}>
      <NTable
        title="11.HW"
        columns={cols}
        rows={rows}
        view={view}
        onView={setView}
        calcs={calc}
        onCalcs={setCalc}
        perPage={per}
        onPerPage={setPer}
        onColumns={setCols}
        onCell={(id, key, v) => {
          setRows((rs) => rs.map((r) => (r.__id === id ? { ...r, [key]: v } : r)))
          say(`저장: ${id} · ${key} = ${v || '(빈 값)'}`)
        }}
        people={PEOPLE}
        meName="전규종"
        onOpen={(id) => say(`상세 화면으로: ${id}`)}
        onPeek={(id) => say(`팝업: ${id}`)}
        onNew={(seed) => say(`새로 만들기 ${seed ? `(${seed.key}=${seed.value})` : ''}`)}
        onBulk={(a, ids) => say(`일괄 ${a}: ${ids.length}건`)}
      />
      </div>
      <pre style={{ marginTop: 18, padding: 10, background: '#fafaf9', borderRadius: 8, fontSize: 12, color: '#57534e' }}>
        {log.join('\n') || '동작 기록이 여기 남습니다'}
      </pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
