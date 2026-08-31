import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/api/client'
import { fillOf } from '@/lib/fieldFill'
import { prefGet, prefSet } from '@/lib/prefs'
import { paintOfAny } from './palette'
import type { CfMeta, CfTarget, CfType, CustomField } from '@/hooks/useCustomFields'
import type { NCol, NOption } from './types'

/**
 * 노션 표의 **필드 살림살이** — 두 화면(REQ-Coverage · Plans)이 함께 쓴다.
 *
 * 표에서 열을 고치면 그 자리에서 화면만 바뀌는 게 아니라 **정의가 서버로**
 * 가야 한다. 그 길이 세 갈래라 한 곳에 모았다.
 *  - 기본 칸의 이름 → `/api/codes/kind-label`
 *  - 기본 칸의 선택지·색·그림·보이기 → `/api/codes` (note 에 hex 로)
 *  - 만든 칸(cf_) 전부 → `/api/custom-fields` (note 에 colors·icons·shows)
 *
 * 두 벌로 두면 한쪽만 고쳐져 「요구사항은 되는데 플랜은 안 된다」 가 된다.
 */
export function useNFields(opts: {
  /** 만든 칸이 매이는 곳 */
  target: CfTarget
  /** 기본 칸 열쇠 → 설정의 코드 종류 */
  kindOf: Record<string, string>
  /** 화면별 접두어 — 다른 표의 폭·숨김과 안 섞이게 */
  pre: string
  /** 열 차례를 담는 설정 열쇠 */
  orderKey: string
}) {
  const { target, kindOf, pre, orderKey } = opts
  const queryClient = useQueryClient()
  const codesQ = useQuery({
    queryKey: ['codes'],
    queryFn: async () => {
      const r = await apiFetch('/api/codes')
      if (!r.ok) throw new Error('코드를 불러오지 못했습니다')
      return (await r.json()) as {
        items: Array<{ kind: string; value: string; note?: string | null; sort_order?: number }>
        kinds?: Record<string, string>
      }
    },
    staleTime: 60_000,
  })
  const cfQ = useQuery({
    queryKey: ['custom-fields'],
    queryFn: async () => {
      const r = await apiFetch('/api/custom-fields')
      if (!r.ok) throw new Error('커스텀 필드를 불러오지 못했습니다')
      return (await r.json()) as CfMeta
    },
    staleTime: 60_000,
  })
  const cfMine = useMemo(
    () => (cfQ.data?.items ?? []).filter((x) => x.target === target),
    [cfQ.data, target],
  )

  /* 저장이 끝나기 전에 화면이 서버 값으로 되돌아가면 방금 고친 게 사라진다.
     그동안은 이 값을 그린다(빈손이면 서버 값). */
  const [edit, setEdit] = useState<NCol[] | null>(null)
  const [rev, setRev] = useState(0)
  const bump = () => setRev((n) => n + 1)

  const noteOf = <T,>(f: CustomField, k: string): Record<string, T> => {
    try {
      return ((JSON.parse(f.note || '{}') as Record<string, Record<string, T>>)[k] ?? {}) as Record<string, T>
    } catch {
      return {}
    }
  }
  const cfColors = (f: CustomField) => noteOf<string>(f, 'colors')
  const cfIcons = (f: CustomField) => noteOf<string>(f, 'icons')
  const cfShows = (f: CustomField) => noteOf<string>(f, 'shows')

  /** 그 종류의 선택지 — 색·그림·보이기까지 설정에서 그대로 */
  const optsOf = (kind: string): NOption[] =>
    (codesQ.data?.items ?? [])
      .filter((x) => x.kind === kind)
      .map((x) => {
        let icon = ''
        let show: NOption['show'] = 'both'
        try {
          const j = JSON.parse(x.note || '{}') as { icon?: string; show?: NOption['show'] }
          icon = String(j.icon || '')
          if (j.show === 'text' || j.show === 'icon') show = j.show
        } catch {
          /* 옛 자료 — 그림 없음 */
        }
        return { value: x.value, color: fillOf(x.note, x.value).bg, icon, show }
      })

  /** 설정이 지어 준 칸 이름 (SETUP 개명을 따른다) */
  const labelOfKind = (kind: string, fallback: string) =>
    (codesQ.data?.kinds ?? {})[kind] || fallback

  /** 만든 칸을 열로 편다 — 정의가 정본이다 */
  const cfCols = (w: (k: string, d: number) => number): NCol[] =>
    cfMine.map((cf) => {
      const ty: NCol['type'] =
        cf.type === 'select'
          ? 'select'
          : cf.type === 'multiselect'
            ? 'multiselect'
            : cf.type === 'number'
              ? 'number'
              : cf.type === 'date'
                ? 'date'
                : 'text'
      return {
        key: `cf_${cf.key}`,
        label: cf.label,
        type: ty,
        width: w(`cf_${cf.key}`, 110),
        ...(ty === 'select' || ty === 'multiselect'
          ? {
              options: (cf.options ?? '')
                .split('\n')
                .map((x) => x.trim())
                .filter(Boolean)
                .map((v) => ({
                  value: v,
                  color: cfColors(cf)[v] ?? '',
                  icon: cfIcons(cf)[v] ?? '',
                  show: (cfShows(cf)[v] as NOption['show']) ?? 'both',
                })),
            }
          : {}),
      }
    })

  /** 기본 칸의 이름·선택지·색을 SETUP 코드로 보낸다 */
  const codeApply = async (before: NCol[], after: NCol[]) => {
    let hit = false
    for (const a of after) {
      const kind = kindOf[a.key]
      if (!kind) continue
      const b0 = before.find((x) => x.key === a.key)
      if (b0 && b0.label !== a.label && a.label.trim()) {
        const r = await apiFetch('/api/codes/kind-label', {
          method: 'POST',
          body: JSON.stringify({ kind, label: a.label.trim() }),
        })
        if (r.ok) hit = true
        else {
          window.alert('열 이름은 관리자만 바꿀 수 있습니다')
          bump()
        }
      }
      if (a.type !== 'select' && a.type !== 'multiselect') continue
      const was = b0?.options ?? []
      const now = a.options ?? []
      for (const [i, o] of now.entries()) {
        const prev = was.find((x) => x.value === o.value)
        if (
          prev &&
          prev.color === o.color &&
          (prev.icon ?? '') === (o.icon ?? '') &&
          (prev.show ?? 'both') === (o.show ?? 'both')
        )
          continue
        const hex = o.color?.startsWith('#') ? o.color : (paintOfAny(o.color).dot ?? '')
        await apiFetch('/api/codes', {
          method: 'POST',
          body: JSON.stringify({
            kind,
            value: o.value,
            sort_order: i,
            note: JSON.stringify({ color: hex, fg: '#fff', icon: o.icon || '', show: o.show ?? 'both' }),
          }),
        })
        hit = true
      }
      for (const o of was) {
        if (now.some((x) => x.value === o.value)) continue
        if (
          !window.confirm(
            `「${o.value}」 를 고를 값 목록에서 지웁니다.\n이미 이 값으로 저장된 줄의 글자는 그대로 남습니다.`,
          )
        )
          continue
        await apiFetch(`/api/codes/${encodeURIComponent(kind)}/${encodeURIComponent(o.value)}`, {
          method: 'DELETE',
        })
        hit = true
      }
    }
    if (hit) await queryClient.invalidateQueries({ queryKey: ['codes'] })
    return hit
  }

  const cfSave = async (p: Record<string, unknown>) => {
    const r = await apiFetch('/api/custom-fields', { method: 'POST', body: JSON.stringify(p) })
    if (!r.ok) {
      const msg =
        ((await r.json().catch(() => ({}))) as { detail?: string }).detail || '저장하지 못했습니다'
      window.alert(msg)
      throw new Error(msg)
    }
  }
  const cfDelete = async (f: CustomField) => {
    const n = f.used ?? 0
    if (
      !window.confirm(
        `필드 「${f.label}」 를 지웁니다.${n ? `\n값이 든 ${n}건이 있습니다 — 값은 남고 칸만 사라집니다.` : ''}`,
      )
    )
      return
    const r = await apiFetch(`/api/custom-fields/${f.id}`, { method: 'DELETE' })
    if (!r.ok) {
      window.alert('지우지 못했습니다')
      throw new Error('삭제 실패')
    }
  }

  /** 표가 준 열 변경을 **필드 정의**로 옮긴다 */
  const cfApply = async (before: NCol[], after: NCol[]) => {
    const byKey = new Map<string, CustomField>(cfMine.map((x) => [`cf_${x.key}`, x]))
    for (const b of before) {
      if (after.some((a) => a.key === b.key)) continue
      const f = byKey.get(b.key)
      if (f) await cfDelete(f)
    }
    const T: Record<string, CfType> = {
      text: 'text',
      number: 'number',
      date: 'date',
      select: 'select',
      multiselect: 'multiselect',
      person: 'text',
    }
    for (const a of after) {
      if (!a.key.startsWith('cf_')) continue
      const f = byKey.get(a.key)
      if (!f) {
        if (before.some((b) => b.key === a.key)) continue
        await cfSave({
          target,
          key: a.key.slice(3),
          label: a.label,
          type: T[a.type] ?? 'text',
          show_list: true,
          show_form: true,
          sort_order: after.indexOf(a),
        })
        continue
      }
      const want = T[a.type] ?? 'text'
      const os = a.options ?? []
      const optStr = os.map((o) => o.value).join('\n')
      const colors = Object.fromEntries(os.filter((o) => o.color).map((o) => [o.value, o.color]))
      const icons = Object.fromEntries(os.filter((o) => o.icon).map((o) => [o.value, o.icon!]))
      const shows = Object.fromEntries(
        os.filter((o) => o.show && o.show !== 'both').map((o) => [o.value, o.show!]),
      )
      const oldOpt = (f.options ?? '').trim()
      const isPick = want === 'select' || want === 'multiselect'
      const changed =
        f.label !== a.label ||
        want !== f.type ||
        (isPick &&
          (optStr.trim() !== oldOpt ||
            JSON.stringify(colors) !== JSON.stringify(cfColors(f)) ||
            JSON.stringify(icons) !== JSON.stringify(cfIcons(f)) ||
            JSON.stringify(shows) !== JSON.stringify(cfShows(f))))
      if (!changed) continue
      let sendOpt = optStr
      let sendColors: Record<string, string | undefined> = colors
      if (isPick && !sendOpt.trim()) {
        /* 서버는 고르기 칸에 **값**을 반드시 요구한다 — 값 없이 타입만
           바꾸면 거절당해 「타입 선택이 안 된다」 로 보였다(지적) */
        const typed = window.prompt(
          `「${a.label}」 에서 고를 값을 한 줄에 하나씩 적으세요`,
          oldOpt || '작성중\n검토중\n완료',
        )
        if (typed === null) {
          bump()
          continue
        }
        sendOpt = typed
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean)
          .join('\n')
        if (!sendOpt) {
          window.alert('고를 값을 한 줄에 하나씩 적어야 고르기 칸이 됩니다')
          bump()
          continue
        }
        sendColors = cfColors(f)
      }
      await cfSave({
        ...f,
        label: a.label,
        type: want,
        options: isPick ? sendOpt : null,
        note: JSON.stringify({ colors: sendColors, icons, shows }),
      })
    }
  }

  /** 폭·숨김·차례는 계정 설정으로, 정의는 서버로 */
  const applyCols = async (before: NCol[], after: NCol[]) => {
    setEdit(after)
    for (const c of after) {
      if (c.width) prefSet(`utop.ntb.w.${pre}${c.key}`, String(c.width))
      prefSet(`utop.ntb.hide.${pre}${c.key}`, c.hidden ? '1' : '0')
    }
    prefSet(orderKey, after.map((c) => c.key).join(','))
    try {
      await cfApply(before, after)
      await codeApply(before, after)
      await cfQ.refetch()
      await codesQ.refetch()
      bump()
    } catch {
      /* 까닭은 이미 알렸다 — 화면은 서버 값으로 되돌린다 */
      bump()
    } finally {
      setEdit(null)
    }
  }

  /** 저장해 둔 폭 — 없으면 기본값 */
  const widthOf = (k: string, d: number) => Number(prefGet(`utop.ntb.w.${pre}${k}`) ?? '') || d
  /** 숨김·차례를 얹어 마무리한다 */
  const dress = (cols: NCol[]): NCol[] => {
    /* 숨긴 열도 **남긴다** — 빼면 속성 판에서도 사라져 못 되살린다(검증) */
    const withHide = cols.map((c) => ({ ...c, hidden: prefGet(`utop.ntb.hide.${pre}${c.key}`) === '1' }))
    const ord = (prefGet(orderKey) ?? '').split(',').filter(Boolean)
    if (!ord.length) return withHide
    const at = new Map(ord.map((k, i) => [k, i]))
    return [...withHide].sort((a, b) => (at.get(a.key) ?? 999) - (at.get(b.key) ?? 999))
  }

  return { codesQ, cfQ, cfMine, optsOf, labelOfKind, cfCols, applyCols, widthOf, dress, edit, rev, bump }
}
