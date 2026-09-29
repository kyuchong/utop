import { useEffect, useState } from 'react'
import { apiFetch, type MeUser } from '@/api/client'
import Wiki from '@/pages/Wiki'

/**
 * 도움말 — 왼쪽 메뉴 SYSTEM 바로 위(지시: 누구나 쓰면서 볼 수 있도록).
 *
 * **위키와 같은 편집기(BlockNote)** 로 읽고 고친다(지시: 마크다운 말고 블록노트).
 * 도움말은 위키 표의 별도 공간(`__help__`)이다 — 일반 위키 나무에는 안 섞이고,
 * 같은 편집기·같은 표·같은 지난 판·같은 PDF 를 그대로 쓴다.
 *
 * 처음 뜰 때 docs/features 의 기능별 문서가 씨앗으로 들어오고(서버가 블록으로
 * 바꾼다), 그 뒤로는 여기서 고친 것이 정본이다. 고치는 사람은 **관리자와 도움말
 * 편집자**(SETUP › 버전·라이선스)뿐이고, 나머지는 읽기만 한다.
 */
export default function Help({ me }: { me?: MeUser | null }) {
  const [canEdit, setCanEdit] = useState<boolean | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const r = await apiFetch('/api/help/access', { cache: 'no-store' })
        setCanEdit(r.ok ? !!((await r.json()) as { can_edit: boolean }).can_edit : false)
      } catch {
        setCanEdit(false)
      }
    })()
  }, [])
  if (canEdit === null) return <div className="empty">도움말 여는 중…</div>
  return <Wiki me={me} space="__help__" canEdit={canEdit} panelTitle="도움말" openKey="utop.help.open" />
}
