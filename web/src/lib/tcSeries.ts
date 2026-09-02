/**
 * **시험 번호의 계열을 읽는 한 곳.**
 *
 * 시험은 한 표에 담기지만 **관리하는 화면이 갈린다**(합의):
 *
 *   E61xx_T0064   요구사항을 덮는 시험 — REQ-Coverage 가 관리한다
 *   E61xx_V0001   Jira 이슈를 덮는 시험 — Releases 가 관리한다
 *
 * 번호로 가르는 까닭은 목록에서 안 보일 때 「어디 갔지」 가 안 생기게
 * 하려는 것이다. 번호만 보면 어느 화면에 있는지 안다.
 *
 * 담는 곳은 하나 그대로다 — 실행기·스텝 편집기·결과는 두 화면이 같은
 * 것을 쓴다. 갈라지는 것은 **보이는 목록**뿐이다.
 */

/** 이 시험이 Jira 이슈를 덮는 것인가 — `E61xx_V0001` 꼴 */
export function isReleaseTc(tcid: unknown): boolean {
  return /_V\d+$/.test(String(tcid ?? '').trim())
}

/** 요구사항 쪽 목록에 설 것인가 — 릴리스 시험만 뺀다.
 *  옛 번호(TC-3212-0067 처럼 주차 규칙)는 요구사항 쪽으로 본다:
 *  Releases 가 생기기 전부터 있던 것이라 그쪽 것이 맞다. */
export const isReqTc = (tcid: unknown): boolean => !isReleaseTc(tcid)
