/**
 * 모듈 × 권리 — 권한의 **한 벌**.
 *
 * 참고한 것: QMetry(모듈 × 권리 격자) · TestRail(역할 = 권한 묶음, 이름을
 * 바꾸고 새로 만들 수 있다) · Zephyr Scale(맨 위 켬/끔).
 *
 * 어느 툴도 「메뉴 보임」 을 따로 관리하지 않는다 — 격자 하나에서 파생시킨다.
 * 표를 두 벌 두면 반드시 어긋난다. 여기도 그 방식이다: `view` 가 없으면
 * 메뉴에 안 뜬다.
 *
 * 모듈은 **왼쪽 메뉴 그대로**이고, 탭이 곧 하위 모듈이다(지시: 하위 페이지는
 * 탭 기준). 그래서 이 목록은 화면에서 이미 쓰는 열쇠말과 같은 것을 쓴다 —
 * 새 이름을 만들면 어느 것이 어느 화면인지 곧 아무도 모른다.
 */

export const RIGHTS = ['view', 'create', 'edit', 'delete', 'run', 'folder'] as const
export type Right = (typeof RIGHTS)[number]

export const RIGHT_LABEL: Record<Right, string> = {
  view: '보기',
  create: '만들기',
  edit: '고치기',
  delete: '지우기',
  run: '실행',
  folder: '폴더 관리',
}

export interface PermModule {
  /** 열쇠 — 화면이 쓰는 것과 같다 */
  k: string
  label: string
  /** 이 모듈에서 뜻이 있는 권리만 칸이 열린다 */
  rights: Right[]
  /** 하위(탭)면 부모 열쇠 */
  under?: string
  hint?: string
}

const RW: Right[] = ['view', 'create', 'edit', 'delete']
const RWF: Right[] = ['view', 'create', 'edit', 'delete', 'folder']

/** 모듈 묶음 — 왼쪽 메뉴의 차례 그대로 */
export const PERM_GROUPS: Array<{ title: string; items: PermModule[] }> = [
  {
    title: 'Quality',
    items: [
      { k: 'dashboard', label: 'Dashboard', rights: ['view'] },
      { k: 'requirements', label: 'Requirements', rights: RWF },
      { k: 'testcases', label: 'Coverage', rights: RWF },
      { k: 'tc.steps', label: '스텝', rights: ['view', 'edit'], under: 'testcases' },
      { k: 'tc.topo', label: 'Topology', rights: ['view', 'edit'], under: 'testcases' },
      { k: 'tc.traffic', label: 'Traffic', rights: ['view', 'edit', 'run'], under: 'testcases' },
      { k: 'tc.manual', label: 'Manual', rights: ['view', 'edit'], under: 'testcases' },
      { k: 'tc.history', label: 'History', rights: ['view'], under: 'testcases' },
      { k: 'cycles', label: 'Cycles', rights: RWF },
      { k: 'cycle.items', label: '항목', rights: ['view', 'create', 'edit', 'delete'], under: 'cycles' },
      {
        k: 'cycle.run',
        label: '실행',
        rights: ['view', 'run', 'edit'],
        under: 'cycles',
        hint: '고치기 = 판정을 손으로 바꾸는 것',
      },
    ],
  },
  {
    title: 'Resources',
    items: [
      { k: 'devices', label: 'Devices', rights: RW },
      { k: 'instruments', label: 'Traffic Gen', rights: ['view', 'edit', 'run'] },
      { k: 'rackview', label: 'Rack View', rights: ['view', 'edit'] },
    ],
  },
  {
    title: 'Integration',
    items: [
      { k: 'defects', label: 'Defects', rights: RW },
      { k: 'releases', label: 'Releases', rights: RW },
    ],
  },
  {
    title: 'AI',
    items: [
      { k: 'ai-tc', label: 'AI', rights: ['view', 'run'] },
      { k: 'knowledge', label: 'Knowledge', rights: RW },
    ],
  },
  {
    title: 'SETUP',
    items: [
      {
        k: 'settings',
        label: 'SETUP',
        rights: ['view'],
        hint: '이것이 없으면 아래 갈래도 안 보입니다',
      },
      { k: 'set.llm', label: 'LLM 설정 · 용도별 프롬프트', rights: ['view', 'edit'], under: 'settings' },
      { k: 'set.codes', label: 'INFO 필드 · 판정 기준 · Step Action · 커스텀 필드', rights: ['view', 'edit'], under: 'settings' },
      { k: 'set.jira', label: 'Jira 연동 · 프로젝트 패널 · 메일', rights: ['view', 'edit'], under: 'settings' },
      { k: 'set.accounts', label: '계정 관리 · 페이지별 접근 권한', rights: ['view', 'edit'], under: 'settings' },
      { k: 'set.data', label: '데이터 내보내기 · 가져오기', rights: ['view', 'run'], under: 'settings' },
      { k: 'set.brand', label: '브랜딩 · 로그인 화면', rights: ['view', 'edit'], under: 'settings' },
    ],
  },
]

export const PERM_MODULES: PermModule[] = PERM_GROUPS.flatMap((g) => g.items)

export interface PermRole {
  key: string
  label: string
  builtin?: boolean
  /** Jira 그룹·프로젝트 역할 — 연동이 정리되면 여기서 받아 온다(지시) */
  jira?: string[]
}

export interface PermDoc {
  enabled: boolean
  roles: PermRole[]
  /** 모듈 → 역할 → 가진 권리 */
  grid: Record<string, Record<string, Right[]>>
}

/** 사람의 역할 이름을 격자의 열쇠로 — 계정은 한글 이름을 쓴다 */
export const ROLE_KEY_OF: Record<string, string> = {
  관리자: 'admin',
  admin: 'admin',
  팀장: 'lead',
  담당: 'owner',
  팀원: 'member',
}

/**
 * 이 사람이 그 모듈에서 그 권리를 갖는가.
 *
 * 체계가 꺼져 있으면 **늘 참**이다 — 표를 다 채우기 전에 켜면 아무도
 * 아무것도 못 한다(Zephyr 의 켬/끔을 그대로 가져왔다).
 * 관리자는 늘 참이다 — 잠긴 방에 열쇠를 두고 나올 수는 없다.
 */
export function canDo(doc: PermDoc | undefined, role: string, mod: string, right: Right): boolean {
  if (!doc?.enabled) return true
  const rk = ROLE_KEY_OF[role] ?? role
  if (rk === 'admin') return true
  return (doc.grid?.[mod]?.[rk] ?? []).includes(right)
}
