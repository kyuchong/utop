/**
 * 지라 표시 이름 → 성+이름(부서). 이 지라는 「김인겸(검증)」 꼴로 부서를 괄호에 둔다.
 * 퇴사는 「이승진(검증)-퇴사자」·「신길수(퇴사자)」 → 이승진(검증·퇴사) · 신길수(퇴사).
 * 한글 이름이 아니면 표시 이름 그대로
 */
export const personName = (dn: string) => {
  const t = dn.trim()
  const m = /^([가-힣]{2,5})(?=$|[\s(（/_·,.-])/.exec(t)
  if (!m) return t
  const gone = /퇴사/.test(t)
  const dept = (/[(（]([^)）]+)[)）]/.exec(t)?.[1] ?? '').replace(/퇴사자?/, '').trim()
  const tag = [dept, gone ? '퇴사' : ''].filter(Boolean).join('·')
  return tag ? `${m[1]}(${tag})` : m[1]!
}
