/**
 * 노션 표 **견본** — REQ-Coverage 표를 그대로 떼어 놓은 한 벌(지시).
 *
 * 새 화면에 표를 세울 때 이 파일을 복사해 이름만 바꾸면 된다. 여기 있는
 * 것이 곧 Coverage·Cycles·Defects 가 쓰는 그 표이고, 여섯 가지 결정을
 * 어디서 어떻게 하는지가 한 자리에 모여 있다:
 *
 *   1) 열 정의(NCol[])      — 무엇을 보여 줄지. 폭·타입·선택지·기본 숨김
 *   2) 열 상태 저장(useNCols) — 사람이 옮긴 차례·폭·숨김을 계정에 남긴다
 *   3) 보기(NView)          — 찾기·거르기·정렬·묶기. 화면이 들고 있는다
 *   4) 줄 만들기(NRow[])    — 자료 → 표 줄. **줄을 통째로 펴서** 넘긴다
 *   5) 칸 그리기(renderCell) — 색 알약·단추처럼 글자가 아닌 칸만
 *   6) 고른 줄 일들(bulk)    — 복제·삭제 같은 여럿에 하는 일
 *
 * 이 파일은 **어디서도 부르지 않는다.** 화면에 서지 않으니 자료를 안 만들고,
 * 복사해 갈 때 지울 것도 없다. 함께 두는 NTableSample.css 가 틀 스타일이다.
 *
 * 쓰는 법
 *   1. 이 파일과 CSS 를 새 이름으로 복사한다(접두어를 꼭 바꾼다 —
 *      CSS 이름이 겹치면 다른 화면이 조용히 망가진다).
 *   2. ROWS 자리에 제 자료를 넣는다.
 *   3. 안 쓰는 열·단추를 지운다. 남겨 두면 눌러도 아무 일 없는 단추가 된다.
 */
import { useMemo, useState } from 'react'
import NTable from './NTable'
import { EMPTY_VIEW, type NCol, type NRow, type NView } from './types'
import { useNCols } from '@/pages/qaBits'
import './NTableSample.css'

/* 자료 한 줄이 무엇인지 — 화면마다 다르다. 표에 넘길 때 이 줄을 통째로 편다 */
interface Item {
  id: string
  name: string
  group: string
  model: string
  state: string
  owner: string
  at: string
}

/**
 * 열 정의.
 *
 * · `fixed` 는 **지울 수 없는 열**이다(속성 창에서 안 사라진다) — ID·제목처럼
 *   그게 없으면 표가 뜻을 잃는 열에만 준다.
 * · `hidden: true` 는 **기본 숨김**이다. 표에는 안 서지만 거르기·묶기 목록에는
 *   선다 — 「묶어 보고는 싶은데 열로는 자리를 못 주는」 것들이 여기 온다.
 * · 거르고 싶은 열은 `type: 'select'` 여야 한다. text 는 고를 값이 안 생긴다.
 * · 선택지 색은 여기서 박지 말고 아래 seed 처럼 **자료에서 뽑아** 붙인다 —
 *   값이 늘 때마다 코드를 고치지 않게 된다.
 */
const DEFS: NCol[] = [
  { key: 'id', label: 'ID', type: 'text', width: 124, fixed: true },
  { key: 'name', label: '제목', type: 'text', width: 320, fixed: true },
  { key: 'group', label: '모델그룹', type: 'text', width: 96 },
  { key: 'model', label: '모델명', type: 'text', width: 96 },
  { key: 'state', label: '상태', type: 'select', width: 96, options: [] },
  { key: 'owner', label: '담당', type: 'person', width: 88 },
  { key: 'at', label: '수정일', type: 'text', width: 110, hidden: true },
]

/** 값마다 고르게 도는 색 — 자료에서 뽑은 선택지에 입힌다 */
function hue(v: string): string {
  let n = 0
  for (const c of v) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return `hsl(${n % 360} 62% 42%)`
}

export default function NTableSample({ items = [] as Item[] }) {
  /* 2) 열 상태 — **계정에 남는다.** 열쇠는 화면마다 달라야 한다(겹치면 두
     화면이 서로의 열 차례를 덮는다). `utop.ntb.` 로 시작해야 서버로 간다. */
  const [cols, setCols] = useNCols('utop.ntb.sample.cols', DEFS)

  /* 3) 보기 — 찾기·거르기·정렬·묶기. 사람이 잡아 둔 것을 **코드가 지우지
     않는다**: 정렬을 대신 풀어 주면 그 사람이 세워 둔 차례가 사라진다.
     오래 남겨야 하면 화면의 문서(서버)에 담는다 — 계정이 아니라. */
  const [view, setView] = useState<NView>({ ...EMPTY_VIEW, groupBy: 'group' })

  /* 선택지는 자료에서 — 지금 표에 있는 값이 곧 고를 값이다 */
  const colsView = useMemo(
    () =>
      cols.map((c) =>
        c.key === 'state'
          ? {
              ...c,
              options: [...new Set(items.map((x) => x.state).filter(Boolean))].map((v) => ({
                value: v,
                color: hue(v),
              })),
            }
          : c,
      ),
    [cols, items],
  )

  /* 4) 줄 만들기 — **통째로 편다.** 칸을 하나씩 골라 담으면, 나중에 열을
     더했을 때 값이 안 따라와 「열은 서 있는데 늘 비어 있는」 일이 생긴다. */
  const rows: NRow[] = useMemo(
    () => items.map((x) => ({ ...x, __id: x.id })),
    [items],
  )

  return (
    /* 스크롤은 **이 판이 맡는다.** 표에 맡기면 머리줄이 같이 흘러간다 */
    <div className="nts-wrap">
      <NTable
        columns={colsView}
        rows={rows}
        view={view}
        onView={setView}
        onColumns={setCols}
        /* 칸을 고치면 부른다 — 읽기 전용 표면 readOnlyKeys 로 다 막는다.
           고친 값을 서버에 싣는 것은 화면 몫이다(무변경은 안 보낸다). */
        onCell={(id, key, v) => {
          void id
          void key
          void v
        }}
        readOnlyKeys={['group', 'model', 'at']}
        idKey="id"
        titleKey="name"
        /* ID 클릭 = 상세로. 제목 앞 팝업 단추(onPeek)는 창으로 띄운다 —
           둘 다 주면 「보기만」 과 「들어가기」 가 갈린다. */
        onOpen={(id) => void id}
        onPeek={(id) => void id}
        /* 5) 글자가 아닌 칸만 직접 그린다 — 나머지는 undefined 를 돌려주면
           표가 알아서 그린다 */
        renderCell={(r, c) => {
          if (c.key === 'state' && !r.state) return <span className="nts-none">–</span>
          return undefined
        }}
        /* 6) 고른 줄에 하는 일 — 위험한 것은 danger 로 빨갛게 */
        bulk={[
          { k: 'clone', label: '복제' },
          { k: 'csv', label: '엑셀' },
          { k: 'del', label: '삭제', danger: true },
        ]}
        onBulk={(a, ids) => {
          void a
          void ids
        }}
        /* 엑셀로 나갈 때, 화면이 계산해 그리는 열은 여기서 글자를 준다 —
           안 주면 그 칸이 빈 채로 나간다 */
        exportTitle="견본 표"
        perPage={100}
      />
    </div>
  )
}
