/* UTOP 고객사 소개 덱 — pptxgenjs */
const pptxgen = require('pptxgenjs')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const sharp = require('sharp')
const fa = require('react-icons/fa')

// ── 팔레트 ─────────────────────────────────────────────
const NAVY = '0F1E3C'
const NAVY2 = '1B2F5C'
const INK = '1A2333'
const MUTED = '6B7A90'
const LINE = 'D5DDE8'
const TINT = 'EEF3F9'
const TEAL = '12A594'
const TEAL_LT = 'DDF4F0'
const AMBER = 'F2A23A'
const AMBER_LT = 'FDEFD9'
const RED = 'E05252'
const WHITE = 'FFFFFF'
const FONT = 'Malgun Gothic'

const W = 13.333
const H = 7.5
const MX = 0.6

// ── 아이콘 ─────────────────────────────────────────────
const iconCache = new Map()
async function iconData(Comp, color) {
  const key = Comp.name + color
  if (iconCache.has(key)) return iconCache.get(key)
  const svg = renderToStaticMarkup(React.createElement(Comp, { color: '#' + color, size: 256 }))
  const buf = await sharp(Buffer.from(svg)).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const data = 'image/png;base64,' + buf.toString('base64')
  iconCache.set(key, data)
  return data
}

async function iconCircle(slide, x, y, d, bg, Comp, fg) {
  slide.addShape('ellipse', { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg, width: 0 } })
  const pad = d * 0.27
  slide.addImage({ data: await iconData(Comp, fg), x: x + pad, y: y + pad, w: d - pad * 2, h: d - pad * 2 })
}

function text(slide, str, opts) {
  slide.addText(str, Object.assign({ fontFace: FONT, isTextBox: true, margin: 0, color: INK, valign: 'top' }, opts))
}

function title(slide, str, sub, dark) {
  text(slide, str, { x: MX, y: 0.45, w: W - MX * 2, h: 0.7, fontSize: 30, bold: true, color: dark ? WHITE : NAVY })
  if (sub) text(slide, sub, { x: MX, y: 1.12, w: W - MX * 2, h: 0.4, fontSize: 14, color: dark ? 'B9C6DD' : MUTED })
}

function footer(slide, n, dark) {
  text(slide, 'UTOP  ·  Ubiquoss Test Orchestration Platform', { x: MX, y: H - 0.42, w: 6, h: 0.25, fontSize: 9, color: dark ? '7F8FB0' : 'A0ABBC' })
  text(slide, String(n), { x: W - MX - 1, y: H - 0.42, w: 1, h: 0.25, fontSize: 9, align: 'right', color: dark ? '7F8FB0' : 'A0ABBC' })
}

function card(slide, x, y, w, h, fill) {
  slide.addShape('roundRect', { x, y, w, h, fill: { color: fill || TINT }, line: { color: fill || TINT, width: 0 }, rectRadius: 0.12 })
}

function line(slide, x1, y1, x2, y2, color, width, arrow) {
  const o = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), line: { color, width: width || 1.25 } }
  if (x2 < x1 && y2 === y1) { o.flipH = true }
  if (y2 < y1) o.flipV = true
  if (x2 < x1) o.flipH = true
  if (arrow) o.line.endArrowType = 'triangle'
  slide.addShape('line', o)
}

// ── 본문 ───────────────────────────────────────────────
async function main() {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE'
  pres.author = 'Ubiquoss'
  pres.title = 'UTOP 소개'
  let n = 0

  // 1. 표지 ─────────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: NAVY }
    // 오른쪽 망 모티프 — 노드와 링크
    const nodes = [
      [9.2, 1.6, 0.42, TEAL], [10.9, 1.1, 0.3, '2E4A85'], [11.9, 2.4, 0.5, '2E4A85'],
      [9.9, 3.3, 0.62, TEAL], [11.4, 4.2, 0.36, '2E4A85'], [8.6, 4.6, 0.3, '2E4A85'],
      [10.2, 5.4, 0.46, AMBER], [12.1, 5.9, 0.3, '2E4A85'], [9.0, 6.3, 0.34, '2E4A85'],
    ]
    const links = [[0, 1], [0, 3], [1, 2], [2, 3], [3, 4], [3, 5], [3, 6], [4, 7], [6, 7], [6, 8], [5, 8], [2, 4]]
    for (const [a, b] of links) {
      const A = nodes[a], B = nodes[b]
      line(s, A[0] + A[2] / 2, A[1] + A[2] / 2, B[0] + B[2] / 2, B[1] + B[2] / 2, '2E4A85', 1.5)
    }
    for (const [x, y, d, c] of nodes) s.addShape('ellipse', { x, y, w: d, h: d, fill: { color: c }, line: { color: NAVY, width: 2 } })

    text(s, 'UTOP', { x: MX, y: 1.7, w: 7, h: 1.3, fontSize: 72, bold: true, color: WHITE, fontFace: 'Arial' })
    text(s, 'Ubiquoss Test Orchestration Platform', { x: MX, y: 2.95, w: 7.5, h: 0.5, fontSize: 20, color: '9FB4D8', fontFace: 'Arial' })
    text(s, '네트워크 장비 시험 자동화 플랫폼', { x: MX, y: 3.75, w: 7.5, h: 0.6, fontSize: 26, bold: true, color: WHITE })
    text(s, '요구사항 관리부터 시험 실행, 고객사 양식 결과서까지 한 곳에서', { x: MX, y: 4.4, w: 7.5, h: 0.5, fontSize: 15, color: 'CADCFC' })
    text(s, '고객사 소개 자료  ·  2026. 09', { x: MX, y: 6.35, w: 6, h: 0.35, fontSize: 12, color: '7F8FB0' })
    text(s, '유비쿼스', { x: MX, y: 6.7, w: 6, h: 0.35, fontSize: 12, bold: true, color: 'B9C6DD' })
    s.addNotes('UTOP 은 유비쿼스가 네트워크 장비 시험을 위해 만든 웹 기반 시험 자동화 플랫폼입니다. 요구사항 관리, 시험 항목 작성, 사이클 실행, 결과서 산출까지 한 곳에서 처리하고 장비 CLI 와 트래픽 계측기를 직접 제어합니다.')
  }

  // 2. 현장의 고민 ────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '시험 현장에서 반복되는 네 가지 고민', '장비 시험은 자동화보다 "그 앞뒤 일" 에 시간이 더 든다')
    const items = [
      [fa.FaFileAlt, RED, '결과를 다시 옮겨 적는다', '시험은 끝났는데 고객사 양식에 맞춰 옮겨 붙이는 데 하루가 간다. 글꼴·표선·로고가 안 맞으면 받는 쪽에서 또 손본다.'],
      [fa.FaWindowClose, AMBER, '실행이 브라우저에 매인다', '수십 건을 걸어 놓고 탭을 닫으면 거기서 멈춘다. 자리를 뜰 수 없고, 다른 사람은 진행을 볼 수 없다.'],
      [fa.FaPuzzlePiece, '5B6B8C', '자료가 흩어져 있다', '규격 문서, 요구사항, 시험 항목, 실행 결과, Jira 이슈가 각각 다른 곳에 있어 "이 요구사항은 어떤 시험이 덮나" 를 답하기 어렵다.'],
      [fa.FaPlug, TEAL, '장비·계측기를 따로 다룬다', 'CLI(SSH/Telnet), SNMP, IXIA N2X, Spirent STC 를 각각의 도구로 조작하고 결과를 사람이 모은다.'],
    ]
    const cw = (W - MX * 2 - 0.3 * 3) / 4
    for (let i = 0; i < 4; i++) {
      const [Ic, c, h, b] = items[i]
      const x = MX + i * (cw + 0.3)
      card(s, x, 1.9, cw, 3.9, TINT)
      await iconCircle(s, x + 0.3, 2.2, 0.8, c, Ic, WHITE)
      text(s, h, { x: x + 0.3, y: 3.2, w: cw - 0.6, h: 0.8, fontSize: 16, bold: true, color: NAVY })
      text(s, b, { x: x + 0.3, y: 3.95, w: cw - 0.6, h: 1.7, fontSize: 12, color: INK, lineSpacingMultiple: 1.25 })
    }
    text(s, 'UTOP 은 이 네 가지를 한 화면 안에서 푼다', { x: MX, y: 6.15, w: W - MX * 2, h: 0.5, fontSize: 18, bold: true, color: TEAL, align: 'center' })
    footer(s, n)
    s.addNotes('도입 배경입니다. 시험 자체보다 결과 정리, 실행 관리, 자료 연결, 장비 조작에 시간이 더 든다는 점을 짚습니다. 특히 결과서 옮겨 적기는 시험 100건이면 하루가 걸리던 일입니다.')
  }

  // 3. UTOP 한눈에 — 흐름 ────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, 'UTOP 한눈에 — 일이 흘러가는 차례 그대로', '적고 → 덮고 → 돌리고 → 낸다. 메뉴도 이 차례로 놓여 있다')
    const steps = [
      [fa.FaBook, 'WIKI', '규격과 절차를 적는다', '프로젝트별 문서 트리, 문서 안 표, 요구사항과 양방향 링크'],
      [fa.FaProjectDiagram, 'REQ-Coverage', '요구사항을 시험으로 덮는다', '요구사항 트리 · 시험 항목 · 매핑(Map) 을 한 화면에서'],
      [fa.FaPlay, 'Cycles', '버전 단위로 돌린다', '실행 서버가 대기줄을 집어 돌리고, 진행은 모두에게 실시간 중계'],
      [fa.FaFilePowerpoint, '결과서', '고객사 양식으로 낸다', 'PPTX · PDF 결과서와 결과 메일을 사이클에서 바로'],
      [fa.FaBug, 'Defects · Jira', '결함을 남기고 릴리즈를 본다', '실행 항목에서 결함 등록 → Jira 이슈, 버전별 검증 현황'],
    ]
    const cw = 2.25, gap = (W - MX * 2 - cw * 5) / 4
    for (let i = 0; i < 5; i++) {
      const [Ic, k, t, d] = steps[i]
      const x = MX + i * (cw + gap)
      const cx = x + cw / 2
      if (i < 4) line(s, x + cw - 0.05, 2.75, x + cw + gap + 0.05, 2.75, LINE, 2, true)
      await iconCircle(s, cx - 0.55, 2.2, 1.1, i === 3 ? AMBER : TEAL, Ic, WHITE)
      text(s, k, { x, y: 3.5, w: cw, h: 0.4, fontSize: 15, bold: true, color: NAVY, align: 'center', fontFace: 'Arial' })
      text(s, t, { x, y: 3.9, w: cw, h: 0.4, fontSize: 13, bold: true, color: INK, align: 'center' })
      text(s, d, { x: x + 0.1, y: 4.4, w: cw - 0.2, h: 1.2, fontSize: 11, color: MUTED, align: 'center', lineSpacingMultiple: 1.2 })
    }
    card(s, MX, 5.85, W - MX * 2, 0.85, TEAL_LT)
    text(s, '같은 저장소, 같은 계정, 같은 링크 — 문서에서 요구사항을 짚고, 요구사항에서 시험을, 시험에서 실행 결과와 결함까지 끊기지 않고 따라간다.', { x: MX + 0.3, y: 5.85, w: W - MX * 2 - 0.6, h: 0.85, fontSize: 13, color: NAVY, valign: 'middle' })
    footer(s, n)
    s.addNotes('UTOP 의 흐름은 다섯 단계입니다. 위키에 규격·절차를 적고, REQ-Coverage 에서 요구사항을 시험으로 덮고, Cycles 에서 돌리고, 결과서를 내고, 결함을 Jira 로 넘깁니다. 이 다섯이 한 저장소·한 계정·한 링크 체계 안에 있다는 점이 핵심입니다.')
  }

  // 4. 시스템 구성 ────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '시스템 구성', 'Docker 로 한 번에 뜨는 3 개 컨테이너 + 실행기. 장비·계측기·외부 시스템은 API 가 대신 붙는다')
    const box = (x, y, w, h, fill, fg, head, sub, headSize) => {
      s.addShape('roundRect', { x, y, w, h, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.1 })
      text(s, head, { x: x + 0.12, y: y + 0.1, w: w - 0.24, h: 0.35, fontSize: headSize || 13, bold: true, color: fg })
      if (sub) text(s, sub, { x: x + 0.12, y: y + 0.45, w: w - 0.24, h: h - 0.5, fontSize: 10, color: fg, lineSpacingMultiple: 1.15 })
    }
    // 열 1: 사용자
    box(MX, 2.3, 2.0, 1.1, TINT, NAVY, '브라우저', 'React + TypeScript\n실시간 진행 · 동시 접속 표시')
    box(MX, 4.3, 2.0, 1.1, TINT, NAVY, '실행기 (runner)', 'Node · 대기줄에서 일감을 집어 실행\n여러 대로 늘릴 수 있음')
    // 열 2: 서버
    s.addShape('roundRect', { x: 3.3, y: 1.85, w: 3.4, h: 4.05, fill: { color: 'F7F9FC' }, line: { color: LINE, width: 1, dashType: 'dash' }, rectRadius: 0.12 })
    text(s, 'UTOP 서버 (Docker Compose)', { x: 3.45, y: 1.95, w: 3.1, h: 0.3, fontSize: 10, bold: true, color: MUTED })
    box(3.5, 2.35, 3.0, 0.9, NAVY, WHITE, 'web  ·  nginx', '화면 정적 파일 · /api /ws 를 백엔드로 넘김')
    box(3.5, 3.4, 3.0, 1.1, NAVY2, WHITE, 'api  ·  FastAPI', '430+ 라우트 · WebSocket 중계\n장비 제어 · 판정 · 결과서 · AI')
    box(3.5, 4.65, 3.0, 1.0, TEAL, WHITE, 'db  ·  PostgreSQL 17', '요구사항 · 시험 · 사이클 · 결함 · 위키\n30+ 테이블, JSONB + 검색 컬럼')
    // 열 3: 장비·계측기
    box(7.9, 1.85, 2.3, 0.9, AMBER_LT, NAVY, '네트워크 장비', 'SSH / Telnet CLI (netmiko)\nSNMP get · set · trap')
    box(7.9, 2.95, 2.3, 0.9, AMBER_LT, NAVY, 'IXIA N2X', 'Tcl API · 윈도우 중계(relay)\n포트 예약 · 트래픽 · 통계')
    box(7.9, 4.05, 2.3, 0.9, AMBER_LT, NAVY, 'Spirent TestCenter', 'REST · 예약 레지스트리\n세션 · 미터')
    // 열 4: 외부
    box(10.9, 1.85, 1.85, 0.7, TINT, NAVY, 'Jira · Confluence', '이슈 · 릴리즈 · 문서', 12)
    box(10.9, 2.75, 1.85, 0.7, TINT, NAVY, 'SMTP 메일', '결과 메일 · 승인 메일', 12)
    box(10.9, 3.65, 1.85, 0.7, TINT, NAVY, 'LLM', 'Claude API · 로컬 LLM · Dify', 12)
    // 연결선
    line(s, 2.6, 2.85, 3.5, 2.85, MUTED, 1.5, true)
    line(s, 2.6, 4.85, 3.5, 4.1, MUTED, 1.5, true)
    line(s, 6.5, 3.95, 7.9, 2.3, MUTED, 1.5, true)
    line(s, 6.5, 3.95, 7.9, 3.4, MUTED, 1.5, true)
    line(s, 6.5, 3.95, 7.9, 4.5, MUTED, 1.5, true)
    line(s, 6.5, 3.6, 10.9, 2.2, LINE, 1.25, true)
    line(s, 6.5, 3.7, 10.9, 3.1, LINE, 1.25, true)
    line(s, 6.5, 3.8, 10.9, 4.0, LINE, 1.25, true)
    text(s, '장비 · 계측기', { x: 7.9, y: 1.5, w: 2.3, h: 0.3, fontSize: 10, bold: true, color: MUTED })
    text(s, '외부 시스템', { x: 10.9, y: 1.5, w: 1.85, h: 0.3, fontSize: 10, bold: true, color: MUTED })
    // 하단 포인트
    const pts = [
      [fa.FaDocker, '설치는 Docker 하나', 'start 스크립트 한 번으로 최신 소스 → 빌드 → 기동 → 브라우저'],
      [fa.FaDatabase, '데이터는 볼륨에', '소스 트리에 운영 데이터가 없다. 백업은 볼륨 두 개만'],
      [fa.FaLock, '백엔드는 밖에 안 연다', '사용자는 web 포트 하나로만 들어오고 API 는 내부망에서만'],
    ]
    for (let i = 0; i < 3; i++) {
      const x = MX + i * 4.1
      await iconCircle(s, x, 6.15, 0.5, TINT, pts[i][0], NAVY)
      text(s, pts[i][1], { x: x + 0.65, y: 6.12, w: 3.3, h: 0.3, fontSize: 12, bold: true, color: NAVY })
      text(s, pts[i][2], { x: x + 0.65, y: 6.4, w: 3.3, h: 0.45, fontSize: 10, color: MUTED })
    }
    footer(s, n)
    s.addNotes('서버는 web, api, db 세 컨테이너와 실행기로 구성됩니다. 장비와 계측기, Jira 같은 외부 시스템은 모두 api 가 대신 붙습니다. N2X 는 Tcl DLL 이 윈도우 전용이라 윈도우 중계를 통해 연결합니다. 실행기는 API 를 통해서만 장비에 붙기 때문에 다른 PC 에 여러 대를 띄울 수 있습니다.')
  }

  // 5. 화면 구성 ──────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '화면 구성', '왼쪽 메뉴 다섯 묶음. 같은 일을 하는 자리는 하나만 둔다')
    const groups = [
      ['QUALITY', TEAL, [[fa.FaBook, 'WIKI', '규격 · 절차 문서'], [fa.FaProjectDiagram, 'REQ-Coverage', '요구사항 ↔ 시험 항목'], [fa.FaPlay, 'Cycles', '플랜 · 실행 · 결과서']]],
      ['RESOURCES', NAVY2, [[fa.FaServer, 'Devices', '장비 등록 · 접속 · 카탈로그'], [fa.FaWaveSquare, 'Traffic Gen', 'N2X · STC 포트 현황'], [fa.FaThLarge, 'Rack View', '랙 실장도 · 접속 LED']]],
      ['INTEGRATION', AMBER, [[fa.FaBug, 'Defects', '결함 → Jira 등록'], [fa.FaJira, 'Jira Issue', '프로젝트별 증분 동기화'], [fa.FaTags, 'Releases', '버전별 이슈 × 덮는 시험']]],
      ['AI', '7A5AF8', [[fa.FaMagic, 'Coverage AI', '말로 시험을 만들고 돌린다'], [fa.FaSearch, 'Knowledge AI', '쌓인 자료에서 근거 있는 답']]],
      ['SYSTEM', MUTED, [[fa.FaCog, 'SETUP', '계정 · 권한 · 필드 · 판정 기준'], [fa.FaExchangeAlt, '데이터 이사', '묶음 내보내기 · 가져오기'], [fa.FaPalette, '브랜딩 · 메일', '로그인 화면 · SMTP']]],
    ]
    const cw = (W - MX * 2 - 0.25 * 4) / 5
    for (let g = 0; g < 5; g++) {
      const [name, c, items] = groups[g]
      const x = MX + g * (cw + 0.25)
      card(s, x, 1.85, cw, 4.75, TINT)
      s.addShape('roundRect', { x: x + 0.2, y: 2.05, w: cw - 0.4, h: 0.42, fill: { color: c }, line: { color: c, width: 0 }, rectRadius: 0.08 })
      text(s, name, { x: x + 0.2, y: 2.05, w: cw - 0.4, h: 0.42, fontSize: 12, bold: true, color: WHITE, align: 'center', valign: 'middle', fontFace: 'Arial' })
      for (let i = 0; i < items.length; i++) {
        const [Ic, k, d] = items[i]
        const y = 2.75 + i * 1.25
        await iconCircle(s, x + 0.2, y, 0.45, WHITE, Ic, c)
        text(s, k, { x: x + 0.72, y: y - 0.02, w: cw - 0.85, h: 0.3, fontSize: 11.5, bold: true, color: NAVY })
        text(s, d, { x: x + 0.72, y: y + 0.27, w: cw - 0.85, h: 0.7, fontSize: 10, color: MUTED, lineSpacingMultiple: 1.15 })
      }
    }
    text(s, '대시보드는 열면 바로 보이는 관제판 — 오늘 실행, 판정 현황, 버전별 진행률, 미해결 결함. 모든 위젯은 눌러서 그 화면으로 들어간다.', { x: MX, y: 6.75, w: W - MX * 2, h: 0.3, fontSize: 11, color: MUTED })
    footer(s, n)
    s.addNotes('메뉴는 다섯 묶음입니다. QUALITY 는 일이 흘러가는 차례대로 WIKI, REQ-Coverage, Cycles. RESOURCES 는 장비·계측기·랙. INTEGRATION 은 Jira 와 이어지는 것들. AI 두 자리, 그리고 SETUP 입니다. 같은 일을 하는 자리를 여러 곳에 두지 않는 것이 설계 원칙입니다.')
  }

  // 6. WIKI · REQ-Coverage ────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, 'WIKI · REQ-Coverage — 적고, 덮는다', '문서와 요구사항과 시험이 서로를 가리킨다')
    // 왼쪽 WIKI
    card(s, MX, 1.85, 5.8, 4.9, TINT)
    await iconCircle(s, MX + 0.3, 2.1, 0.6, TEAL, fa.FaBook, WHITE)
    text(s, 'WIKI — 프로젝트마다 갖는 문서', { x: MX + 1.05, y: 2.18, w: 4.5, h: 0.45, fontSize: 16, bold: true, color: NAVY })
    const wiki = [
      '규격 · 시험 절차 · 사전 준비를 문서 트리로 관리',
      '문서 안에 표를 두고 행 단위로 편집 · 요구사항 생성',
      '문서에서 REQ 를 짚으면, 요구사항 쪽에서도 "이 문서가 나를 참조한다"',
      '손이 멈추면 자동 저장(2초) · 판 이력 보관',
      'PDF 로 바로 내려받기 — 화면과 같은 엔진으로 찍어 종이가 화면과 같다',
    ]
    text(s, wiki.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < wiki.length - 1, paraSpaceAfter: 8 } })), { x: MX + 0.3, y: 2.95, w: 5.2, h: 3.5, fontSize: 12, color: INK })
    // WIKI 트리 목업
    {
      const ty = 4.8
      const rowsT = [
        [0, fa.FaFolder, 'L2 스위치 규격', null],
        [1, fa.FaFileAlt, 'VLAN 시험 절차', 'REQ-2633-0003'],
        [1, fa.FaFileAlt, 'QoS 시험 절차', 'REQ-2633-0004'],
        [0, fa.FaFolder, '사전 준비', null],
      ]
      for (let i = 0; i < rowsT.length; i++) {
        const [lv, Ic, label, ref] = rowsT[i]
        const y = ty + i * 0.4
        const x = MX + 0.4 + lv * 0.4
        s.addImage({ data: await iconData(Ic, lv ? MUTED : AMBER), x, y: y + 0.07, w: 0.22, h: 0.22 })
        text(s, label, { x: x + 0.32, y, w: 2.5, h: 0.36, fontSize: 11, color: INK, valign: 'middle' })
        if (ref) {
          line(s, x + 2.0, y + 0.18, x + 2.6, y + 0.18, MUTED, 1.25, true)
          s.addShape('roundRect', { x: x + 2.65, y: y + 0.03, w: 1.45, h: 0.3, fill: { color: NAVY }, line: { color: NAVY, width: 0 }, rectRadius: 0.15 })
          text(s, ref, { x: x + 2.65, y: y + 0.03, w: 1.45, h: 0.3, fontSize: 9.5, bold: true, color: WHITE, align: 'center', valign: 'middle', fontFace: 'Arial' })
        }
      }
      text(s, '문서 ↔ 요구사항 양방향 참조', { x: MX + 0.4, y: ty + 1.62, w: 5, h: 0.3, fontSize: 10, color: MUTED })
    }
    // 오른쪽 REQ-Coverage
    const rx = MX + 6.1
    card(s, rx, 1.85, W - MX - rx, 4.9, TINT)
    await iconCircle(s, rx + 0.3, 2.1, 0.6, TEAL, fa.FaProjectDiagram, WHITE)
    text(s, 'REQ-Coverage — 요구사항을 시험으로 덮는다', { x: rx + 1.05, y: 2.18, w: 5.2, h: 0.45, fontSize: 16, bold: true, color: NAVY })
    const req = [
      '요구사항 목록 · 시험 목록 · 상세 · 붙이기(Map) 를 한 화면에서',
      '2 단 분류 폴더 · 커스텀 필드 · 일괄 편집 · 휴지통 복원',
      '어떤 요구사항이 아직 시험으로 안 덮였나(갭) 가 바로 보인다',
      '?req= · ?tc= 주소로 남에게 보낸 링크가 그대로 열린다',
    ]
    text(s, req.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < req.length - 1, paraSpaceAfter: 8 } })), { x: rx + 0.3, y: 2.95, w: 5.4, h: 2.0, fontSize: 12, color: INK })
    // 미니 매핑 그림
    const my = 5.15
    const pill = (x, y, w, label, fill, fg) => {
      s.addShape('roundRect', { x, y, w, h: 0.36, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.18 })
      text(s, label, { x, y, w, h: 0.36, fontSize: 10, bold: true, color: fg, align: 'center', valign: 'middle', fontFace: 'Arial' })
    }
    pill(rx + 0.4, my, 1.5, 'REQ-2633-0003', NAVY, WHITE)
    pill(rx + 0.4, my + 0.55, 1.5, 'REQ-2633-0004', NAVY, WHITE)
    pill(rx + 0.4, my + 1.1, 1.5, 'REQ-2633-0005', RED, WHITE)
    pill(rx + 3.4, my, 1.5, 'TC-0117', TEAL, WHITE)
    pill(rx + 3.4, my + 0.55, 1.5, 'TC-0118', TEAL, WHITE)
    pill(rx + 3.4, my + 1.1, 1.5, 'TC-0121', TEAL, WHITE)
    line(s, rx + 1.9, my + 0.18, rx + 3.4, my + 0.18, MUTED, 1.25)
    line(s, rx + 1.9, my + 0.18, rx + 3.4, my + 0.73, MUTED, 1.25)
    line(s, rx + 1.9, my + 0.73, rx + 3.4, my + 1.28, MUTED, 1.25)
    text(s, '미연결 = 갭', { x: rx + 2.0, y: my + 1.1, w: 1.3, h: 0.36, fontSize: 10, color: RED, valign: 'middle', align: 'center' })
    footer(s, n)
    s.addNotes('위키는 프로젝트별 문서입니다. 별도 위키를 붙이지 않고 안에 둔 이유는 계정·프로젝트·링크가 한 벌이어야 문서와 요구사항이 서로를 가리킬 수 있기 때문입니다. REQ-Coverage 는 요구사항과 시험을 합쳐 보는 자리로, 아직 시험으로 덮이지 않은 요구사항이 바로 드러납니다.')
  }

  // 7. 시험 항목(TC) ──────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '시험 항목 — 스텝 하나가 명령 · 기대값 · 판정', '한 시험으로 여러 기종을, 파라미터 하나로 여러 버전을')
    const feats = [
      [fa.FaListOl, '스텝 그리드', '스텝마다 대상 장비 · 명령 · 기대값 · 판정 종류. 세션 열고 닫는 스텝은 필요 없다 — 자동으로 붙고 끊는다.'],
      [fa.FaCodeBranch, 'IF ${model} 분기', '기종에 따라 다른 명령을 한 시험 안에서 나눈다. 시험 1 건으로 다기종 대응.'],
      [fa.FaDollarSign, '변수 · 전역 파라미터', '${name} 치환, ${i+100} 연산, 중첩 치환. 반복 번호와 SNMP 인덱스가 어긋나도 한 벌로.'],
      [fa.FaSitemap, '토폴로지 · 결선도', '시험 환경(장비 · 포트 연결)을 판에 그려 두면 결과서에 같은 그림이 들어간다.'],
      [fa.FaHistory, '개정 이력', '저장할 때마다 판을 남기고 되돌린다. 실행 이력(누가 · 언제 · 결과) 도 자동 축적.'],
    ]
    for (let i = 0; i < 5; i++) {
      const y = 1.9 + i * 0.95
      await iconCircle(s, MX, y, 0.55, TINT, feats[i][0], NAVY)
      text(s, feats[i][1], { x: MX + 0.75, y: y - 0.02, w: 6.0, h: 0.3, fontSize: 13, bold: true, color: NAVY })
      text(s, feats[i][2], { x: MX + 0.75, y: y + 0.28, w: 6.0, h: 0.6, fontSize: 11, color: INK, lineSpacingMultiple: 1.15 })
    }
    // 판정 표
    const tx = 7.6
    text(s, '판정 종류 — 응답을 보고 Pass / Fail 을 가른다', { x: tx, y: 1.9, w: W - MX - tx, h: 0.35, fontSize: 13, bold: true, color: NAVY })
    const hdr = (t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, fontFace: 'Arial', fontSize: 11 } })
    const cell = (t, mono) => ({ text: t, options: { color: INK, fontSize: 11, fontFace: mono ? 'Courier New' : FONT } })
    const rows = [
      [hdr('type'), hdr('규칙')],
      [cell('contains', 1), cell('출력에 있으면 합격')],
      [cell('contains_all', 1), cell('모두 있으면 합격')],
      [cell('notcontains', 1), cell('있으면 불합격')],
      [cell('ok', 1), cell('오류만 없으면 합격')],
      [cell('line', 1), cell('항목(키 : 값) 일치')],
      [cell('table', 1), cell('표에서 행 · 열로 판정')],
      [cell('none', 1), cell('판정 안 함 (조회만)')],
    ]
    s.addTable(rows, { x: tx, y: 2.35, w: W - MX - tx, colW: [1.7, W - MX - tx - 1.7], rowH: 0.36, border: { type: 'solid', color: LINE, pt: 0.75 }, fill: { color: WHITE }, margin: 0.06, valign: 'middle' })
    card(s, tx, 5.5, W - MX - tx, 1.2, TEAL_LT)
    text(s, '스텝 종류', { x: tx + 0.25, y: 5.6, w: 4, h: 0.3, fontSize: 12, bold: true, color: NAVY })
    text(s, 'CLI 명령 · SNMP get / set / trap 대기 · 계측기 트래픽(N2X · STC) · 값 견주기(Diff) · 반복 · 대기 · 수동 확인 스텝. 자동 · 수동 실행 타입을 시험마다 지정한다.', { x: tx + 0.25, y: 5.9, w: W - MX - tx - 0.5, h: 0.75, fontSize: 11, color: INK, lineSpacingMultiple: 1.15 })
    footer(s, n)
    s.addNotes('시험 항목은 스텝의 나열입니다. 스텝마다 장비·명령·기대값·판정 종류를 두고, 판정은 일곱 가지 규칙으로 응답을 봅니다. IF 분기와 변수 치환으로 한 시험이 여러 기종과 여러 버전을 덮습니다. 토폴로지를 그려 두면 결과서에 그대로 들어갑니다.')
  }

  // 8. 장비 · 계측기 제어 ─────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '장비 · 계측기 제어', 'CLI 부터 트래픽 계측기까지 같은 스텝 문법으로 다룬다')
    const tiles = [
      [fa.FaTerminal, NAVY, 'CLI  ·  SSH / Telnet', ['netmiko 기반, 프롬프트 인식 · 자동 enable', '장비별 커넥션 캐시 + 락 — 같은 장비는 순차, 다른 장비는 병렬', '스트리밍 실행 · 자동완성 · 웹 터미널', '30분 무갱신 시 세션 정리']],
      [fa.FaMicrochip, TEAL, 'SNMP', ['get · set · trap 대기 스텝', 'MIB 에서 뽑은 enum 688 OID — 숫자 대신 이름으로 표시', 'RO / RW community 를 장비 접속 정보에 함께']],
      [fa.FaWaveSquare, AMBER, 'IXIA N2X', ['Tcl 데몬 · 윈도우 중계로 리눅스 서버에서 제어', '포트 그리드 · 예약 · 해제', '트래픽 시작 · 통계 · 중지 · 초기화']],
      [fa.FaBroadcastTower, '7A5AF8', 'Spirent TestCenter', ['REST 세션 제어 · 연결 확인', '예약 레지스트리 — 직렬화로 포트 충돌 방지', '미터(계측 값) 를 스텝 결과로 받아 판정']],
    ]
    const cw = (W - MX * 2 - 0.3 * 3) / 4
    for (let i = 0; i < 4; i++) {
      const [Ic, c, h, items] = tiles[i]
      const x = MX + i * (cw + 0.3)
      card(s, x, 1.85, cw, 3.6, TINT)
      await iconCircle(s, x + 0.3, 2.1, 0.7, c, Ic, WHITE)
      text(s, h, { x: x + 0.3, y: 2.95, w: cw - 0.6, h: 0.4, fontSize: 14, bold: true, color: NAVY })
      text(s, items.map((t, j) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: j < items.length - 1, paraSpaceAfter: 5 } })), { x: x + 0.3, y: 3.4, w: cw - 0.6, h: 1.95, fontSize: 10.5, color: INK })
    }
    // 랙뷰 띠
    card(s, MX, 5.7, W - MX * 2, 1.05, NAVY)
    await iconCircle(s, MX + 0.3, 5.95, 0.55, NAVY2, fa.FaThLarge, WHITE)
    text(s, 'Rack View — "그 장비 어디 있어요" 를 눈으로 답한다', { x: MX + 1.05, y: 5.85, w: 8, h: 0.35, fontSize: 13, bold: true, color: WHITE })
    text(s, '구역 · 랙 · U 자리에 실물 배치 그대로. LED 가 접속 상태를 말하고, 장비를 누르면 그 자리에서 편집. 끌어다 놓기로 배치, 랙 머리에 소모전력 합계.', { x: MX + 1.05, y: 6.2, w: W - MX * 2 - 1.4, h: 0.45, fontSize: 11, color: 'CADCFC' })
    footer(s, n)
    s.addNotes('장비는 SSH/Telnet CLI 와 SNMP 로, 계측기는 IXIA N2X 와 Spirent TestCenter 를 지원합니다. 계측기도 장비와 같은 등록부를 써서 "장비는 비었는데 계측기가 잡혀 있다" 를 한 화면에서 알 수 있습니다. 랙 뷰는 시험실 실장도로, 접속 상태를 LED 로 보여 줍니다.')
  }

  // 9. Cycles 실행 ────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, 'Cycles — 걸어 두고 손을 뗀다', '실행은 브라우저가 아니라 실행 서버가 한다')
    // 흐름도
    const fy = 2.1
    const fb = (x, w, fill, fg, head, sub) => {
      s.addShape('roundRect', { x, y: fy, w, h: 1.25, fill: { color: fill }, line: { color: fill, width: 0 }, rectRadius: 0.1 })
      text(s, head, { x: x + 0.15, y: fy + 0.15, w: w - 0.3, h: 0.35, fontSize: 13, bold: true, color: fg })
      text(s, sub, { x: x + 0.15, y: fy + 0.5, w: w - 0.3, h: 0.7, fontSize: 10, color: fg, lineSpacingMultiple: 1.15 })
    }
    fb(MX, 2.5, TINT, NAVY, '① 화면', '플랜에 시험을 담고 「실행」\n일감을 대기줄에 걸고 손을 뗀다')
    fb(MX + 3.0, 2.5, NAVY2, WHITE, '② 대기줄 (DB)', 'cycle_run 표\n여러 실행기가 집어도 같은 것을 둘이 집지 않는다')
    fb(MX + 6.0, 2.5, TEAL, WHITE, '③ 실행기', '스텝을 돌리고 판정\n장비에는 API 를 통해서만 붙는다')
    fb(MX + 9.0, W - MX * 2 - 9.0, AMBER_LT, NAVY, '④ 실시간 중계', 'WebSocket 으로 보고 있는\n모두의 화면에 진행 · 로그')
    for (const x of [MX + 2.5, MX + 5.5, MX + 8.5]) line(s, x + 0.05, fy + 0.62, x + 0.45, fy + 0.62, MUTED, 2, true)
    // 포인트 6개 2x3
    const pts = [
      [fa.FaPowerOff, '탭을 닫아도 돈다', '64 건을 걸어 놓고 퇴근해도 아침에 결과가 있다'],
      [fa.FaUsers, '모두가 같은 진행을 본다', '진행률 · 현재 스텝 · 실행자. 원격 중지 요청도 요청자 표시'],
      [fa.FaEquals, '판정 규칙은 한 벌', '시험 화면과 실행기가 같은 코드를 쓴다 — TC 에서 Pass 인데 사이클에서 Fail 인 일이 없다'],
      [fa.FaRedo, '반복 · 자동 / 수동', '같은 시험을 N 회 반복, 자동 시험과 수동 확인 시험을 나눠 진행'],
      [fa.FaLayerGroup, '실행기 여러 대', '다른 PC 에 실행기만 띄워 API 주소만 향하게 하면 된다'],
      [fa.FaChartBar, '플랜 현황', '판정 현황 막대 · 진행률 · 빌드 간 비교 · 결과서를 낼 수 있는지 까닭과 함께'],
    ]
    for (let i = 0; i < 6; i++) {
      const col = i % 3, row = Math.floor(i / 3)
      const x = MX + col * 4.1, y = 4.0 + row * 1.6
      await iconCircle(s, x, y, 0.5, TINT, pts[i][0], NAVY)
      text(s, pts[i][1], { x: x + 0.65, y: y - 0.03, w: 3.3, h: 0.3, fontSize: 12, bold: true, color: NAVY })
      text(s, pts[i][2], { x: x + 0.65, y: y + 0.27, w: 3.3, h: 0.9, fontSize: 10.5, color: INK, lineSpacingMultiple: 1.15 })
    }
    footer(s, n)
    s.addNotes('예전에는 브라우저가 실행을 붙들고 있어 탭을 닫으면 멈췄습니다. 지금은 화면이 일감을 대기줄에 걸면 실행 서버가 집어서 돌리고, 진행은 WebSocket 으로 모두에게 중계됩니다. 판정 규칙은 시험 화면과 실행기가 같은 TypeScript 코드를 쓰기 때문에 결과가 어긋나지 않습니다.')
  }

  // 10. 결과 — 결과서 · 메일 · 대시보드 ──────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '결과 — 고객사 양식 그대로, 사이클에서 바로', '옮겨 붙이는 하루를 없앤다')
    // 왼쪽 큰 카드: 결과서
    card(s, MX, 1.85, 6.4, 4.9, NAVY)
    await iconCircle(s, MX + 0.35, 2.15, 0.7, AMBER, fa.FaFilePowerpoint, WHITE)
    text(s, '고객사 결과서 (PPTX · PDF)', { x: MX + 1.2, y: 2.25, w: 5, h: 0.45, fontSize: 18, bold: true, color: WHITE })
    const rp = [
      '고객사가 준 PPTX 양식을 그대로 열고, 그 안의 장을 복제해 값만 채운다 — 글꼴 · 표선 · 로고가 저쪽 양식 그대로',
      '시험 목적 · 사전 준비 · 토폴로지 그림 · 스텝별 명령과 응답 · 판정을 자동 배치, 넘치면 이어지는 장 추가',
      '버전 기준으로 사이클이 끝나면 결과서 화면을 거치지 않고 사이클에서 바로',
      '미리보기와 파일이 같은 쪽 나누기 — 화면에서 센 장수와 파일 장수가 같다',
      '양식은 파일 하나와 채울 자리 지도 한 줄로 늘어난다 — 고객사마다 다른 양식 대응',
    ]
    text(s, rp.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < rp.length - 1, paraSpaceAfter: 8 } })), { x: MX + 0.35, y: 3.0, w: 5.7, h: 2.3, fontSize: 11.5, color: 'E6EDF8' })
    // 결과서 장 목업 — 고객사 양식 한 장
    {
      const mx = MX + 0.35, my = 5.3, mw = 5.7, mh = 1.25
      s.addShape('rect', { x: mx, y: my, w: mw, h: mh, fill: { color: WHITE }, line: { color: 'C9D3E2', width: 0.75 } })
      s.addShape('rect', { x: mx + 0.15, y: my + 0.12, w: mw - 0.3, h: 0.22, fill: { color: 'E4E9F2' }, line: { color: 'E4E9F2', width: 0 } })
      text(s, 'TC_ID  │  REQ ID  │  시험항목  │  판정', { x: mx + 0.25, y: my + 0.12, w: mw - 0.5, h: 0.22, fontSize: 8, bold: true, color: NAVY, valign: 'middle' })
      for (let i = 0; i < 3; i++) line(s, mx + 0.15, my + 0.55 + i * 0.22, mx + mw - 0.15, my + 0.55 + i * 0.22, 'E4E9F2', 0.75)
      text(s, '시험 목적 · 사전 준비 · 토폴로지 · 명령과 응답 …', { x: mx + 0.25, y: my + 0.38, w: mw - 2.0, h: 0.6, fontSize: 8, color: MUTED, valign: 'top' })
      s.addShape('roundRect', { x: mx + mw - 1.35, y: my + 0.5, w: 1.1, h: 0.3, fill: { color: TEAL }, line: { color: TEAL, width: 0 }, rectRadius: 0.15 })
      text(s, 'PASS', { x: mx + mw - 1.35, y: my + 0.5, w: 1.1, h: 0.3, fontSize: 9, bold: true, color: WHITE, align: 'center', valign: 'middle', fontFace: 'Arial' })
      text(s, '고객사 양식  ·  1 / 284', { x: mx + 0.15, y: my + mh - 0.3, w: mw - 0.3, h: 0.22, fontSize: 8, color: MUTED, align: 'right' })
    }
    // 오른쪽 두 카드
    const rx = MX + 6.7, rw = W - MX - rx
    card(s, rx, 1.85, rw, 2.3, TINT)
    await iconCircle(s, rx + 0.3, 2.1, 0.55, TEAL, fa.FaEnvelope, WHITE)
    text(s, '결과 메일', { x: rx + 1.0, y: 2.15, w: rw - 1.3, h: 0.4, fontSize: 15, bold: true, color: NAVY })
    text(s, '받는 사람 · 참조 · 첨부를 갖춘 메일을 사이클에서 보낸다. 보낸 메일은 이력으로 남고 「이 메일로 다시 쓰기」 로 같은 수신자에게 다음 결과를 보낸다.', { x: rx + 0.3, y: 2.75, w: rw - 0.6, h: 1.3, fontSize: 11.5, color: INK, lineSpacingMultiple: 1.2 })
    card(s, rx, 4.4, rw, 2.35, TINT)
    await iconCircle(s, rx + 0.3, 4.65, 0.55, TEAL, fa.FaTachometerAlt, WHITE)
    text(s, '대시보드 · 플랜 현황', { x: rx + 1.0, y: 4.7, w: rw - 1.3, h: 0.4, fontSize: 15, bold: true, color: NAVY })
    text(s, '오늘 실행 · 판정 현황 · 버전별 진행률 · 미해결 결함 · 자동/수동 비율. 실데이터가 없는 것은 흉내 내지 않고, 실행이 쌓일수록 스스로 채워진다.', { x: rx + 0.3, y: 5.3, w: rw - 0.6, h: 1.3, fontSize: 11.5, color: INK, lineSpacingMultiple: 1.2 })
    footer(s, n)
    s.addNotes('결과서는 고객사가 준 PPTX 양식을 그대로 열어 장을 복제하고 값만 채우는 방식입니다. 서식을 손대지 않으므로 받는 쪽 눈에는 자기네 양식 그대로입니다. 결과 메일과 대시보드도 사이클 안에서 바로 이어집니다.')
  }

  // 11. 결함 · Jira ───────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '결함 · Jira 연동', '결함은 우리가 따로 드는 자료가 아니라 Jira 이슈다')
    // 흐름
    const fy = 2.0
    const nodes = [
      [fa.FaPlay, TEAL, '실행 항목', '실패한 자리에서\n「결함 등록」'],
      [fa.FaBug, RED, 'Defects', 'DEF-… 로 쌓인다\n미해결 · 등록 · 닫힘'],
      [fa.FaJira, NAVY2, 'Jira 이슈', '프로젝트 · 유형 · 우선순위 ·\n수정버전 · 구성요소 그대로'],
      [fa.FaTags, AMBER, 'Releases', 'fixVersion 별 이슈와\n그 이슈를 덮는 시험'],
    ]
    const cw = 2.6, gap = (W - MX * 2 - cw * 4) / 3
    for (let i = 0; i < 4; i++) {
      const [Ic, c, h, d] = nodes[i]
      const x = MX + i * (cw + gap)
      if (i < 3) line(s, x + cw + 0.05, fy + 0.5, x + cw + gap - 0.05, fy + 0.5, LINE, 2, true)
      await iconCircle(s, x + cw / 2 - 0.5, fy, 1.0, c, Ic, WHITE)
      text(s, h, { x, y: fy + 1.15, w: cw, h: 0.35, fontSize: 14, bold: true, color: NAVY, align: 'center' })
      text(s, d, { x, y: fy + 1.5, w: cw, h: 0.7, fontSize: 11, color: MUTED, align: 'center', lineSpacingMultiple: 1.15 })
    }
    // 세 카드
    const cards = [
      ['Jira Issue — 가져다 본다', ['Jira 에는 팔만 건이 넘는다. 프로젝트를 골라 그것만 받는다', '한 번 받은 것은 우리 DB 에 두고, 다음 Sync 는 바뀐 것만 — 두 번째부터는 몇 초', '사업자 · 문제유형 · 이슈분류 · 시험시설 같은 실제 커스텀 필드 그대로']],
      ['Releases — 배포 전에 본다', ['"이번 릴리스의 이슈가 다 검증됐나" 를 버전 단위로', 'Sync 한 것은 남는다 — 새로고침해도 표가 비지 않는다', '버전 이름의 괄호에서 사업자를 뽑아 같은 묶음으로']],
      ['Knowledge AI 와 이어진다', ['아침마다 받아 둔 Jira 캐시가 AI 검색의 자료가 된다', '"이 증상과 비슷한 이슈가 있었나" 를 근거와 함께 답한다', 'Confluence 문서도 같은 방식으로 붙는다']],
    ]
    const kw = (W - MX * 2 - 0.3 * 2) / 3
    for (let i = 0; i < 3; i++) {
      const x = MX + i * (kw + 0.3)
      card(s, x, 4.45, kw, 2.3, TINT)
      text(s, cards[i][0], { x: x + 0.25, y: 4.6, w: kw - 0.5, h: 0.35, fontSize: 13, bold: true, color: NAVY })
      text(s, cards[i][1].map((t, j) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: j < 2, paraSpaceAfter: 5 } })), { x: x + 0.25, y: 5.0, w: kw - 0.5, h: 1.7, fontSize: 10.5, color: INK })
    }
    footer(s, n)
    s.addNotes('결함은 실행 항목에서 그 자리에서 등록하고, Defects 화면에서 골라 Jira 로 밉니다. Jira Issue 는 프로젝트를 골라 증분 동기화하고 DB 에 둡니다. Releases 는 버전별로 이슈와 그것을 덮는 시험을 보여 배포 전 검증 여부를 확인합니다.')
  }

  // 12. AI ───────────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, 'AI — 시험을 만드는 AI, 자료를 찾는 AI', '쓰기와 읽기는 다른 일이라 자리를 둘로 나눴다')
    const half = (W - MX * 2 - 0.4) / 2
    // Coverage AI
    card(s, MX, 1.85, half, 3.85, TINT)
    await iconCircle(s, MX + 0.3, 2.1, 0.65, '7A5AF8', fa.FaMagic, WHITE)
    text(s, 'Coverage AI — 말로 시험을 만든다', { x: MX + 1.1, y: 2.2, w: half - 1.4, h: 0.45, fontSize: 16, bold: true, color: NAVY })
    const flow = ['짜고', '돌리고', '보고', '저장']
    for (let i = 0; i < 4; i++) {
      const x = MX + 0.3 + i * 1.45
      s.addShape('roundRect', { x, y: 2.95, w: 1.2, h: 0.4, fill: { color: i === 3 ? TEAL : WHITE }, line: { color: i === 3 ? TEAL : LINE, width: 1 }, rectRadius: 0.2 })
      text(s, flow[i], { x, y: 2.95, w: 1.2, h: 0.4, fontSize: 11, bold: true, color: i === 3 ? WHITE : NAVY, align: 'center', valign: 'middle' })
      if (i < 3) line(s, x + 1.22, 3.15, x + 1.43, 3.15, MUTED, 1.25, true)
    }
    const ca = [
      '매뉴얼 · 기존 시험 항목을 찾아 초안을 짜고, 장비를 골라 바로 돌려 본다',
      '응답을 보고 고친 뒤 쓸 만하면 시험으로 저장 — 저장한 뒤에야 플랜에 들어간다',
      '워드 · PDF · 엑셀 구현 내용을 올리면 마크다운으로 읽어 시험 초안의 근거로 쓴다',
      '자연어 명령 실행에는 명령 차단 필터가 있다',
    ]
    text(s, ca.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < ca.length - 1, paraSpaceAfter: 7 } })), { x: MX + 0.3, y: 3.6, w: half - 0.6, h: 2.3, fontSize: 11.5, color: INK })
    // Knowledge AI
    const rx = MX + half + 0.4
    card(s, rx, 1.85, half, 3.85, TINT)
    await iconCircle(s, rx + 0.3, 2.1, 0.65, '7A5AF8', fa.FaSearch, WHITE)
    text(s, 'Knowledge AI — 근거 있는 답', { x: rx + 1.1, y: 2.2, w: half - 1.4, h: 0.45, fontSize: 16, bold: true, color: NAVY })
    const src = ['Wiki', '요구사항 · 시험', '실행 결과', 'Jira 캐시']
    for (let i = 0; i < 4; i++) {
      const x = rx + 0.3 + i * 1.45
      s.addShape('roundRect', { x, y: 2.95, w: 1.3, h: 0.4, fill: { color: WHITE }, line: { color: LINE, width: 1 }, rectRadius: 0.2 })
      text(s, src[i], { x, y: 2.95, w: 1.3, h: 0.4, fontSize: 10.5, bold: true, color: NAVY, align: 'center', valign: 'middle' })
    }
    const ka = [
      '자료는 전부 우리 저장소 — 묻는다고 Jira 에 실시간으로 가지 않는다',
      '답 속 [n] 을 누르면 근거 문서가 옆에 열린다. 어디서 나온 답인지 늘 안다',
      '검색 범위는 하나만 고른다 — 셋을 켜 두고 물으면 출처를 알 수 없었다',
      '대화는 계정별로 남아 다음 접속에 이어지고, 도움이 됐는지 표시를 모은다',
    ]
    text(s, ka.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < ka.length - 1, paraSpaceAfter: 7 } })), { x: rx + 0.3, y: 3.6, w: half - 0.6, h: 2.3, fontSize: 11.5, color: INK })
    // LLM 선택
    card(s, MX, 5.95, W - MX * 2, 0.7, NAVY)
    text(s, 'LLM 은 골라 쓴다 —  Claude API  ·  로컬 LLM  ·  Dify 어시스턴트.   설정 화면에서 여러 모델을 등록하고 순서를 정한다. API 키는 저장소에 두지 않는다.', { x: MX + 0.3, y: 5.95, w: W - MX * 2 - 0.6, h: 0.7, fontSize: 11.5, color: WHITE, valign: 'middle' })
    footer(s, n)
    s.addNotes('AI 는 두 자리입니다. Coverage AI 는 말로 시험을 짜고 돌려 보고 저장하는 자리, Knowledge AI 는 쌓인 자료에서 근거와 함께 답하는 자리입니다. LLM 은 Claude API, 로컬 LLM, Dify 중 골라 쓸 수 있습니다.')
  }

  // 13. 운영 · 보안 · 데이터 ──────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '운영 · 보안 · 데이터', '설치는 한 줄, 데이터는 소스와 분리, 계정과 권한은 화면 단위')
    const rows = [
      [fa.FaDocker, TEAL, '설치 · 업데이트', 'Windows 는 start.ps1, 리눅스 · macOS 는 start.sh 한 번. 최신 소스 → .env 생성 → 이미지 빌드 → 기동 → 브라우저. 같은 스크립트를 다시 돌리면 업데이트다. 데이터는 볼륨에 있어 지워지지 않는다.'],
      [fa.FaDatabase, NAVY2, '데이터 · 백업', '운영 데이터는 db-data · app-data 볼륨 두 개에만 있다. 저장소를 clone 해도 남의 시험 데이터나 장비 비밀번호가 따라오지 않고, 백업은 볼륨 두 개만 챙긴다.'],
      [fa.FaExchangeAlt, AMBER, '랩 간 자료 이사', 'WIKI · 요구사항 · 시험 · 플랜 · 결함 · 장비 · 카탈로그 · 설정을 묶음으로 골라 JSON 하나로 내보내고, 받는 쪽은 ID 기준 합치기(있으면 덮고 없으면 만들고 지우지 않음). 장비 비밀번호와 LLM · Jira 키는 기본 제외.'],
      [fa.FaUserShield, '7A5AF8', '계정 · 권한 · 이력', '회원가입 + 관리자 승인(승인 메일), 역할별 화면 · 기능 권한, 조직 옵션. 변경은 감사 로그와 시험 개정 이력에 남는다. 같은 것을 누가 같이 보고 있는지 표시하되 잠그지는 않는다.'],
      [fa.FaLock, RED, '노출 최소화', '백엔드 포트는 호스트에 열지 않는다. 사용자는 web 포트 하나로 들어오고 nginx 가 내부망으로 API 에 붙는다. 자격증명 파일은 커밋되지 않는다.'],
    ]
    for (let i = 0; i < 5; i++) {
      const [Ic, c, h, d] = rows[i]
      const y = 1.85 + i * 0.98
      await iconCircle(s, MX, y, 0.6, c, Ic, WHITE)
      text(s, h, { x: MX + 0.85, y: y - 0.02, w: 2.6, h: 0.6, fontSize: 14, bold: true, color: NAVY, valign: 'middle' })
      text(s, d, { x: MX + 3.5, y: y - 0.05, w: W - MX * 2 - 3.5, h: 0.85, fontSize: 11, color: INK, lineSpacingMultiple: 1.2, valign: 'middle' })
      if (i < 4) line(s, MX, y + 0.83, W - MX, y + 0.83, LINE, 0.75)
    }
    footer(s, n)
    s.addNotes('운영 관점입니다. Docker 하나로 설치와 업데이트가 끝나고, 데이터는 볼륨에만 있어 소스와 분리됩니다. 랩마다 서 있는 UTOP 사이에 자료를 묶음으로 옮길 수 있고, 계정·권한·감사 로그를 갖추고 있습니다. 백엔드는 밖에 열지 않습니다.')
  }

  // 14. 도입 전 · 후 ──────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '도입 전 · 후', '사람이 하던 옮기기 · 붙들기 · 찾기가 사라진다')
    const hdr = (t, c) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: c }, fontSize: 12, align: 'center' } })
    const c = (t, o) => ({ text: t, options: Object.assign({ fontSize: 11, color: INK }, o || {}) })
    const rows = [
      [hdr('항목', NAVY), hdr('도입 전', '8A94A6'), hdr('UTOP', TEAL)],
      [c('결과서', { bold: true }), c('시험이 끝난 뒤 고객사 양식에 손으로 옮겨 붙임 — 100 건이면 하루'), c('사이클에서 바로 고객사 양식 PPTX · PDF, 서식 그대로')],
      [c('실행', { bold: true }), c('브라우저가 붙들고 있어 탭을 닫으면 멈춤, 진행은 실행자만 앎'), c('실행 서버가 대기줄을 집어 돌리고 진행은 모두에게 실시간')],
      [c('다기종 · 다버전', { bold: true }), c('기종 · 버전마다 시험을 복사해 따로 관리'), c('IF ${model} 분기 · 파라미터로 시험 한 벌')],
      [c('요구사항 추적', { bold: true }), c('문서 · 요구사항 · 시험 · 결과가 각각의 파일에'), c('문서 ↔ 요구사항 ↔ 시험 ↔ 실행 ↔ 결함이 링크로 이어짐, 갭이 바로 보임')],
      [c('계측기', { bold: true }), c('N2X · STC 를 별도 도구로 조작하고 값을 사람이 모음'), c('같은 스텝 문법으로 트래픽 · 미터 값을 받아 자동 판정')],
      [c('결함', { bold: true }), c('시험 결과를 보고 Jira 에 다시 입력'), c('실패한 자리에서 결함 등록 → Jira 이슈, 릴리즈별 검증 현황')],
      [c('설치 · 이전', { bold: true }), c('Python · DB 를 PC 마다 맞춰 설치, 데이터는 폴더 복사'), c('Docker 한 줄, 데이터는 볼륨, 랩 간 이사는 묶음 내보내기')],
    ]
    const tw = W - MX * 2
    s.addTable(rows, { x: MX, y: 1.9, w: tw, colW: [1.9, (tw - 1.9) / 2, (tw - 1.9) / 2], rowH: [0.42, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6], border: { type: 'solid', color: LINE, pt: 0.75 }, fill: { color: WHITE }, margin: 0.08, valign: 'middle', fontFace: FONT })
    footer(s, n)
    s.addNotes('도입 전후 비교입니다. 결과서, 실행, 다기종 대응, 요구사항 추적, 계측기, 결함, 설치까지 사람이 손으로 하던 일이 어떻게 바뀌는지 항목별로 정리했습니다.')
  }

  // 15. 도입 절차 ─────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: WHITE }
    title(s, '도입 절차', '첫 결과서까지 네 단계')
    const steps = [
      [fa.FaDocker, '환경 준비', ['Docker 가 있는 서버 1 대 (Windows · 리눅스)', 'start 스크립트로 기동, 접속 확인', '장비 접속 정보(IP · 계정 · 방식) 등록', 'N2X 는 윈도우 중계, STC 는 서버 주소']],
      [fa.FaFileImport, '자료 이관', ['기존 요구사항 · 시험 항목 가져오기', '규격 · 절차 문서를 WIKI 에', 'Jira 프로젝트 연결과 첫 Sync', '고객사 결과서 양식 등록']],
      [fa.FaPlay, '시범 사이클', ['한 버전을 골라 플랜 구성', '자동 · 수동 시험을 나눠 실행', '결과서 · 결과 메일 산출', '결함 1 건을 Jira 까지 흘려 본다']],
      [fa.FaUsers, '정착', ['계정 · 역할 · 권한 정리', '실행기 추가(다른 PC)', '사용자 교육과 도움말', '백업 주기와 볼륨 관리']],
    ]
    const cw = (W - MX * 2 - 0.3 * 3) / 4
    for (let i = 0; i < 4; i++) {
      const [Ic, h, items] = steps[i]
      const x = MX + i * (cw + 0.3)
      card(s, x, 1.85, cw, 4.6, i === 2 ? TEAL_LT : TINT)
      s.addShape('ellipse', { x: x + 0.3, y: 2.1, w: 0.5, h: 0.5, fill: { color: NAVY }, line: { color: NAVY, width: 0 } })
      text(s, String(i + 1), { x: x + 0.3, y: 2.1, w: 0.5, h: 0.5, fontSize: 14, bold: true, color: WHITE, align: 'center', valign: 'middle', fontFace: 'Arial' })
      await iconCircle(s, x + cw - 0.95, 2.05, 0.6, WHITE, Ic, TEAL)
      text(s, h, { x: x + 0.3, y: 2.8, w: cw - 0.6, h: 0.45, fontSize: 17, bold: true, color: NAVY })
      text(s, items.map((t, j) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: j < items.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.3, y: 3.4, w: cw - 0.6, h: 2.9, fontSize: 11.5, color: INK })
      if (i < 3) line(s, x + cw + 0.02, 4.1, x + cw + 0.28, 4.1, MUTED, 2, true)
      const done = ['장비 접속 확인 완료', '커버리지 갭 0 확인', '첫 결과서 · 결함 1 건 산출', '운영 이관 완료']
      line(s, x + 0.3, 5.55, x + cw - 0.3, 5.55, LINE, 0.75)
      text(s, '완료 기준', { x: x + 0.3, y: 5.65, w: cw - 0.6, h: 0.25, fontSize: 9.5, bold: true, color: MUTED })
      s.addImage({ data: await iconData(fa.FaCheckCircle, TEAL), x: x + 0.3, y: 5.95, w: 0.22, h: 0.22 })
      text(s, done[i], { x: x + 0.6, y: 5.9, w: cw - 0.9, h: 0.32, fontSize: 11, bold: true, color: NAVY, valign: 'middle' })
    }
    text(s, '기존 UTOP 이 있는 랩이라면 「데이터 내보내기 · 가져오기」 로 2 단계가 몇 분에 끝난다.', { x: MX, y: 6.65, w: W - MX * 2, h: 0.3, fontSize: 11, color: MUTED })
    footer(s, n)
    s.addNotes('도입은 환경 준비, 자료 이관, 시범 사이클, 정착의 네 단계입니다. 시범 사이클에서 결과서와 결함 흐름까지 한 번 끝까지 흘려 보는 것을 권합니다.')
  }

  // 16. 마무리 ────────────────────────────────────────────
  {
    const s = pres.addSlide(); n++
    s.background = { color: NAVY }
    const nodes = [[1.0, 1.4, 0.36, '2E4A85'], [2.2, 2.4, 0.52, TEAL], [0.9, 3.6, 0.3, '2E4A85'], [2.6, 4.4, 0.34, '2E4A85'], [1.6, 5.6, 0.44, AMBER], [3.4, 5.9, 0.28, '2E4A85']]
    const links = [[0, 1], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5], [3, 5]]
    for (const [a, b] of links) { const A = nodes[a], B = nodes[b]; line(s, A[0] + A[2] / 2, A[1] + A[2] / 2, B[0] + B[2] / 2, B[1] + B[2] / 2, '2E4A85', 1.5) }
    for (const [x, y, d, c] of nodes) s.addShape('ellipse', { x, y, w: d, h: d, fill: { color: c }, line: { color: NAVY, width: 2 } })
    text(s, '요구사항에서 결과서까지,\n한 곳에서.', { x: 4.6, y: 1.9, w: 8.2, h: 1.8, fontSize: 40, bold: true, color: WHITE, lineSpacingMultiple: 1.15 })
    text(s, '적고 → 덮고 → 돌리고 → 낸다', { x: 4.6, y: 3.85, w: 8, h: 0.5, fontSize: 18, color: TEAL, bold: true })
    const pts = ['고객사 양식 그대로 나오는 결과서', '브라우저를 닫아도 도는 실행 서버', '문서 · 요구사항 · 시험 · 결함이 이어진 추적', 'CLI · SNMP · N2X · STC 를 한 문법으로']
    text(s, pts.map((t, i) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: i < pts.length - 1, paraSpaceAfter: 6 } })), { x: 4.6, y: 4.5, w: 8, h: 1.6, fontSize: 14, color: 'CADCFC' })
    text(s, '감사합니다  ·  Q & A', { x: 4.6, y: 6.4, w: 8, h: 0.5, fontSize: 16, color: WHITE, bold: true })
    text(s, 'UTOP  ·  Ubiquoss Test Orchestration Platform', { x: 4.6, y: 6.85, w: 8, h: 0.3, fontSize: 10, color: '7F8FB0' })
    s.addNotes('마무리입니다. UTOP 은 요구사항에서 결과서까지를 한 곳에서 처리합니다. 질문을 받겠습니다.')
  }

  await pres.writeFile({ fileName: process.argv[2] || 'UTOP_소개.pptx' })
  console.log('written', n, 'slides')
}

main().catch((e) => { console.error(e); process.exit(1) })
