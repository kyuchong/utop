import { useEffect, useRef, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/components/Login'
import { apiFetch, authApi, getToken, setToken, type MeUser } from '@/api/client'
import { useLiveRefresh } from '@/components/useLiveRefresh'
import { useFreshBuild } from '@/components/useFreshBuild'
import { goto, onGoto as onGotoEvent, reflectUrl } from '@/api/goto'
import Dashboard from '@/pages/Dashboard'
import ReqTc from '@/pages/ReqTc'
import Wiki from '@/pages/Wiki'
import Settings from '@/pages/Settings'
import AiTc from '@/pages/AiTc'
import Cycles from '@/pages/Cycles'
import Defects from '@/pages/Defects'
import Devices from '@/pages/Devices'
import Instruments from '@/pages/Instruments'
import RackView from '@/pages/RackView'

/**
 * 화면 하나를 옮길 때마다 여기 분기를 한 줄 늘린다.
 * 아직 안 옮긴 메뉴는 안내만 띄운다 — 기존 앱(8000 포트)에 그대로 남아 있다.
 */
const PAGE_KEY = 'utop.page'

/* 아는 화면 이름들. 주소로 들어온 값을 그대로 믿으면 옛 이름·오타에
   「아직 새 UI로 옮기지 않았습니다」 벽이 나온다(지적: 이상한 화면).
   모르는 이름은 Dashboard 로 보낸다 — 벽보다는 쓸 수 있는 화면이 낫다. */
const KNOWN_PAGES = new Set([
  'dashboard', 'wiki', 'reqtc', 'cycles', 'executions',
  'devices', 'instruments', 'rackview',
  'defects', 'releases', 'ai-tc', 'settings',
])

export default function App() {
  // 새로고침해도 보던 화면으로 돌아온다. 장비를 등록하다 새로고침했는데
  // 요구사항으로 튕기면 다시 찾아 들어가야 한다.
  const [page, setPageRaw] = useState(() => {
    try {
      const p = localStorage.getItem(PAGE_KEY) || 'reqtc'
      /* 지운 화면의 이름이 기억에 남아 있으면 「아직 안 옮겼습니다」 백지가
         나온다(지적: 이상한 페이지) — Requirements·Coverage 는 REQ-Coverage
         로 합쳐졌으므로 그리로 보낸다. */
      if (p === 'requirements' || p === 'testcases') return 'reqtc'
      /* 그 밖에 **모르는 이름**도 벽 대신 쓸 수 있는 화면으로 보낸다.
         이름을 하나씩 적어 두는 방식은 지울 때마다 여기를 같이 고쳐야 해서
         한 번은 빠뜨린다 — 아는 이름이 아니면 다 보내는 편이 안전하다. */
      return KNOWN_PAGES.has(p) ? p : 'reqtc'
    } catch {
      return 'reqtc'
    }
  })

  /* 지금 화면을 붙들어 둔다 — 주소를 적을 때 필요한데, 주소를 읽는
     effect 는 한 번만 돌아서 그때의 page 만 알고 있다. */
  const pageRef = useRef(page)
  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    try {
      localStorage.setItem(PAGE_KEY, page)
    } catch {
      /* 사생활 보호 모드에서 저장이 막혀도 화면은 돌아야 한다 */
    }
  }, [page])
  /**
   * 화면을 옮긴다 — **주소에 자리를 하나 만들면서**(지시).
   *
   * 전에는 주소의 딥링크만 지우고 자리를 안 만들었다. 그러면 뒤로가기가
   * 방금 있던 화면을 건너뛰고 그 전 딥링크로 가서, 엉뚱한 화면이 나왔다.
   * 이제 화면마다 ?p=<이름> 을 갖는다.
   */
  const navTo = (k: string) => {
    const url = `${window.location.pathname}?p=${encodeURIComponent(k)}`
    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState({ utop: true }, '', url)
    }
    setPage(k)
  }

  // undefined = 확인 중 / null = 로그인 필요
  /* **죽은 화면 이름이 들어와도 벽을 세우지 않는다.**
     화면을 합치거나 지울 때 setPage('requirements') 같은 자리가 한 군데씩
     남는다 — 실제로 goto 처리기와 Dashboard 카드 다섯 곳이 그랬다. 이름을
     하나씩 찾아 고치는 것만으로는 다음에 또 빠뜨리므로, 들어오는 값을
     여기서 한 번 거른다. */
  const setPage = (k: string) => setPageRaw(KNOWN_PAGES.has(k) ? k : 'reqtc')

  // undefined = 확인 중 / null = 로그인 필요
  const [user, setUser] = useState<MeUser | null | undefined>(undefined)

  // 저장된 토큰이 아직 살아 있는지 확인한다. 만료됐는데 앱을 띄우면
  // 모든 호출이 401 로 떨어져서 화면이 텅 빈 채로 남는다.
  useEffect(() => {
    if (!getToken()) {
      setUser(null)
      return
    }
    authApi
      .me()
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
  }, [])

  /**
   * 주소로 들어온 부탁 — `?tc=U-…`.
   *
   * 새 탭에서 링크를 열면 이 창은 처음부터 시작한다. 기억해 둔 화면이
   * 아니라 **주소가 가리키는 것**부터 보여야 한다. 읽은 뒤 주소는
   * 지운다 — 남겨 두면 새로 고칠 때마다 같은 곳으로 되돌아가, 그 뒤에
   * 무엇을 열어 두었든 없던 일이 된다.
   */
  useEffect(() => {
    const kinds = [
      ['tc', 'utop.tc.open', 'reqtc'],
      ['req', 'utop.req.sel', 'reqtc'],
      // ?ce=CE-2633-002 — 실행 링크. cycle 보다 앞이라 둘 다 있으면 ce 가 이긴다
      ['ce', 'utop.cycle.ce', 'cycles'],
      ['cycle', 'utop.cycle.sel', 'cycles'],
      ['report', 'utop.report.cycle', 'executions'],
      /* ?cat=cat-… — REQ-Coverage 의 폴더 링크. 「지금 보는 이 자리」 를
         그대로 보내려면 폴더도 주소가 있어야 한다(지시: 링크 복사). */
      ['cat', 'utop.reqtc.cat', 'reqtc'],
      /* ?wiki=wk-… — 위키 문서 링크. 문서끼리 짚은 자리를 눌렀을 때와
         남에게 보낸 주소가 같은 길로 열린다 */
      ['wiki', 'utop.wiki.open', 'wiki'],
    ] as const
    /*
     * 주소를 **지우지 않는다.** 전에는 읽고 바로 지웠는데, 그러면 주소창이
     * 늘 IP 뿐이라 지금 보는 것을 남에게 보낼 수가 없었다. 옛 화면이
     * `#cycle=…` 로 하던 그 일이다. 뒤로가기도 이 주소들을 따라간다.
     */
    /* 옛 ID 로 온 주소를 **새 ID 로 넘겨준다.**
       ID 규칙이 모델그룹 기준으로 바뀌었는데, 북마크·위키·메일에 붙여 둔
       옛 주소(?req=REQ-2632-0002)는 우리가 고칠 수 없다. 못 찾겠으면
       한 번 물어보고 넘어간다 — 물어보는 값이 없으면(=안 바뀐 ID) 그대로다.
       주소창도 새 ID 로 고쳐 준다: 다음에 복사할 때 옛 것이 또 퍼지면 안 된다. */
    const translate = async (key: string, id: string): Promise<string> => {
      if (key !== 'req' && key !== 'tc' && key !== 'cycle' && key !== 'ce') return id
      try {
        const r = await apiFetch(`/api/id-alias?old=${encodeURIComponent(id)}`)
        if (!r.ok) return id
        const j = (await r.json()) as { new_id?: string }
        return j.new_id || id
      } catch {
        return id
      }
    }

    const apply = async () => {
      const p = new URLSearchParams(window.location.search)
      for (const [key, store, to] of kinds) {
        const raw = p.get(key)
        if (!raw) continue
        const id = await translate(key, raw)
        if (id !== raw) {
          p.set(key, id)
          window.history.replaceState({ utop: true }, '', `${window.location.pathname}?${p}`)
        }
        try {
          localStorage.setItem(store, id)
        } catch {
          /* 사생활 보호 모드 */
        }
        setPage(to)
        // 이미 그 화면에 있으면 페이지 전환이 안 일어난다 — 화면 안
        // 선택은 goto 알림이 맡는다(각 화면이 듣는다).
        goto(key, id)
        return
      }
      /* 딥링크가 아니면 **어느 화면인가**를 주소에서 읽는다(?p=wiki).
         이게 없으면 뒤로가기가 주소만 되돌리고 화면은 그대로 남아,
         주소와 화면이 서로 다른 말을 한다(지적: 이상한 화면). */
      const pk = p.get('p')
      if (pk) {
        setPage(KNOWN_PAGES.has(pk) ? pk : 'dashboard')
        return
      }
      /* 주소가 비었다 — 지금 화면을 적어 둔다. 모든 자리가 제 주소를
         가져야 뒤로가기가 갈 곳을 안다. */
      window.history.replaceState(
        { utop: true },
        '',
        `${window.location.pathname}?p=${encodeURIComponent(pageRef.current)}`,
      )
    }
    void apply()
    const onPop = () => void apply()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // 남이 바꾼 것을 어느 화면에 있든 바로 들여온다. 화면마다 따로 붙이면
  // 또 어느 하나가 빠지므로 여기 한 곳에서 듣는다.
  useLiveRefresh()

  /*
   * 이 화면이 옛 판인가.
   *
   * 서버를 새로 올려도 브라우저는 받아 둔 파일을 계속 쓴다. 그래서 한
   * 사람은 새 화면, 한 사람은 옛 화면을 보고 — 자료는 하나뿐인데 —
   * 서로 다른 수를 읽는다. 20줄과 200줄이 그렇게 갈렸다.
   */
  const staleBuild = useFreshBuild()

  // 다른 화면의 것을 열어 달라는 부탁 (사이클에서 TC ID 를 누른 것 따위)
  useEffect(
    () =>
      onGotoEvent((kind, id) => {
        reflectUrl(kind, id)
        /* **여기가 「이상한 화면」 의 진짜 원인이었다(지적).**
           Requirements·Coverage 를 REQ-Coverage 로 합칠 때 이 자리를
           안 고쳤다. ?cat= 로 들어오면 App 이 화면을 reqtc 로 맞춘 뒤
           곧바로 goto 가 여기로 와서 없어진 'requirements' 로 덮어썼다 —
           그래서 「아직 새 UI로 옮기지 않았습니다」 벽이 떴다.
           시험(tc)은 'testcases' 로 보내고 있었는데 그것도 없어진 화면이다. */
        if (kind === 'tc') {
          localStorage.setItem('utop.tc.open', id)
          setPage('reqtc')
        } else if (kind === 'cat') {
          localStorage.setItem('utop.reqtc.cat', id)
          setPage('reqtc')
        } else if (kind === 'wiki') {
          localStorage.setItem('utop.wiki.open', id)
          setPage('wiki')
        } else if (kind === 'cycle') {
          localStorage.setItem('utop.cycle.sel', id)
          setPage('cycles')
        } else if (kind === 'ce') {
          localStorage.setItem('utop.cycle.ce', id)
          setPage('cycles')
        } else if (kind === 'report') {
          // 지나간 실행을 시간순으로 보는 화면. 어느 회차에서 왔는지 남겨
          // 그 화면이 그것부터 보여 줄 수 있게 한다.
          localStorage.setItem('utop.report.cycle', id)
          setPage('executions')
        } else {
          localStorage.setItem('utop.req.sel', id)
          setPage('reqtc')
        }
      }),
    [],
  )

  if (user === undefined) return <div className="empty">확인 중…</div>
  if (user === null) return <Login onDone={setUser} />

  return (
    <>
      {staleBuild && (
        <div className="stale-build">
          새 판이 올라왔습니다 — 지금 화면은 옛 판이라 값이 다르게 보일 수 있습니다.
          <button type="button" onClick={() => window.location.reload()}>
            새로 고치기
          </button>
        </div>
      )}
    <Layout
      user={user}
      onLogout={() => {
        void authApi.logout()
        setToken('')
        setUser(null)
      }}
      current={page}
      onNavigate={navTo}
    >
      {page === 'dashboard' ? (
        <Dashboard onNav={navTo} />
      ) : page === 'reqtc' ? (
        <ReqTc me={user} />
      ) : page === 'wiki' ? (
        <Wiki />
      ) : page === 'ai-tc' ? (
        <AiTc />
      ) : page === 'cycles' ? (
        <Cycles me={user} />
      ) : page === 'executions' ? (
        /* 옛 Reports 자리 — 북마크로 들어오면 사이클 화면을 보여 준다 */
        <Cycles me={user} />
      ) : page === 'defects' ? (
        <Defects />
      ) : page === 'devices' ? (
        <Devices me={user} />
      ) : page === 'instruments' ? (
        <Instruments me={user} />
      ) : page === 'rackview' ? (
        <RackView />
      ) : page === 'settings' ? (
        <Settings />
      ) : page === 'releases' ? (
        /* 아직 안 만든 화면. 「기존 화면에서 계속 사용할 수 있습니다」 라고
           적어 두었는데 옛 화면이 없어져 **거짓말**이 되었다(지적). 무엇을
           할 자리인지와 지금 어디를 쓰면 되는지를 적는다. */
        <div className="empty">
          <b>Releases — 준비 중입니다.</b>
          <br />
          버전별로 무엇이 들어갔고 어느 시험이 돌았는지 모아 볼 자리입니다.
          <br />
          지금은 <b>Cycles</b> 에서 버전을 골라 보실 수 있습니다.
        </div>
      ) : (
        /* 여기로 오면 안 된다 — 주소·기억에 모르는 이름이 들어온 것이다.
           벽을 세우느니 쓸 수 있는 화면을 낸다. */
        <ReqTc me={user} />
      )}
    </Layout>
    </>
  )
}
