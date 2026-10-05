import { Chip } from '@mui/material'
import type { EnvironmentState, PlanStatus } from '@/types'

const planStatusMap: Record<PlanStatus, { label: string; color: 'default' | 'success' | 'warning' | 'error' }> = {
  'awaiting-approval': { label: '待审批', color: 'default' },
  active: { label: '计划生效中', color: 'success' },
  invalidated: { label: '已失效 · 需重审', color: 'error' },
  completed: { label: '全部环境已完成', color: 'success' },
}

const environmentStateMap: Record<EnvironmentState, { label: string; color: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  awaiting: { label: '待推进', color: 'default' },
  active: { label: '运行中', color: 'info' },
  completed: { label: '已完成', color: 'success' },
  'rolled-back': { label: '已回滚', color: 'error' },
  blocked: { label: '断链阻断', color: 'error' },
}

export function PlanStatusChip({ status }: { status: PlanStatus }) {
  const value = planStatusMap[status]
  return <Chip label={value.label} color={value.color} size="small" variant={status === 'active' ? 'filled' : 'outlined'} />
}

export function EnvironmentStateChip({ state }: { state: EnvironmentState }) {
  const value = environmentStateMap[state]
  return <Chip label={value.label} color={value.color} size="small" variant={state === 'active' ? 'filled' : 'outlined'} />
}
