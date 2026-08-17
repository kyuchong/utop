import {
  IconBranch,
  IconChip,
  IconCli,
  IconDiff,
  IconClock,
  IconHand,
  IconLoop,
  IconMeter,
  IconNote,
  IconPing,
  IconPlug,
  IconSnmp,
  IconSwap,
  IconSwitch,
  IconUnplug,
} from '@/components/icons'
import type { StepIcon as Name } from './types'

const MAP = {
  cli: IconCli,
  meter: IconMeter,
  branch: IconBranch,
  loop: IconLoop,
  switch: IconSwitch,
  clock: IconClock,
  plug: IconPlug,
  unplug: IconUnplug,
  chip: IconChip,
  note: IconNote,
  hand: IconHand,
  ping: IconPing,
  snmp: IconSnmp,
  diff: IconDiff,
  swap: IconSwap,
} as const

/**
 * 스텝 종류 아이콘.
 *
 * types.ts 는 이름만 담고 실제 그림은 여기서 고른다 — 자료 모양을 다루는
 * 파일에 React 를 들이지 않기 위해서다.
 */
export default function StepIcon({ name, className }: { name: Name; className?: string }) {
  const C = MAP[name] ?? IconNote
  return <C className={className} />
}
