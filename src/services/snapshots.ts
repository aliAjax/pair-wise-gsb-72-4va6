import type {
  BrokenChain,
  Environment,
  EnvironmentRuntime,
  FeatureFlag,
  ReleasePlan,
  ReleaseSnapshot,
  SnapshotPayload,
} from '@/types'

export const ENVIRONMENTS: Environment[] = ['dev', 'staging', 'production']

/** 从开关当前配置提取需要固化进快照的内容 */
export function buildSnapshotPayload(flag: FeatureFlag): SnapshotPayload {
  return {
    name: flag.name,
    enabled: flag.enabled,
    audienceRules: flag.audienceRules.map((rule) => ({ ...rule })),
    regions: [...flag.regions],
    minClientVersion: { ...flag.minClientVersion },
    dependencies: flag.dependencies.map((dependency) => ({ ...dependency })),
    rollbackConditions: [...flag.rollbackConditions],
    rollbackThresholds: [...flag.rollbackConditions],
    metricNames: [...flag.metricNames],
    rolloutSteps: flag.rolloutSteps.map((step) => ({ ...step, guardrails: [...step.guardrails] })),
    initialPercentage: flag.rolloutPercentage,
  }
}

/** FNV-1a 校验和，用于保存后验证快照完整、检测半套写入 */
export function snapshotChecksum(flagId: string, version: number, payload: SnapshotPayload): string {
  const serialized = JSON.stringify({ flagId, version, payload })
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

let snapshotSequence = 0

/** 由审批动作生成一份新的不可变发布快照（version 由持久层按已有快照推导） */
export function createSnapshot(
  flag: FeatureFlag,
  version: number,
  approval: { approvedBy: string; comment: string; freezeUntil?: string; createdAt: string },
): ReleaseSnapshot {
  const payload = buildSnapshotPayload(flag)
  snapshotSequence += 1
  return {
    id: `snap-${flag.id}-v${version}-${Date.now()}-${snapshotSequence}`,
    flagId: flag.id,
    flagKey: flag.key,
    version,
    configRevision: flag.configRevision,
    createdAt: approval.createdAt,
    approvedBy: approval.approvedBy,
    approvalComment: approval.comment,
    freezeUntil: approval.freezeUntil,
    checksum: snapshotChecksum(flag.id, version, payload),
    payload,
  }
}

/** 重新校验快照完整性（重新计算 checksum） */
export function isSnapshotIntact(snapshot: ReleaseSnapshot): boolean {
  return snapshotChecksum(snapshot.flagId, snapshot.version, snapshot.payload) === snapshot.checksum
}

/** 审批通过后建立新的发布计划，三个环境全部等待推进 */
export function newPlan(snapshotId: string, createdAt: string): ReleasePlan {
  return {
    id: `plan-${snapshotId}`,
    status: 'active',
    latestSnapshotId: snapshotId,
    environments: ENVIRONMENTS.map<EnvironmentRuntime>((environment) => ({
      environment,
      state: 'awaiting',
      snapshotId: '',
      stepIndex: -1,
      percentage: 0,
      paused: false,
      advancedAt: '',
      updatedAt: createdAt,
      brokenChains: [],
    })),
  }
}

/** 记录断链并将环境标记为阻断，停止下一阶段 */
export function markBrokenChain(runtime: EnvironmentRuntime, chain: BrokenChain): EnvironmentRuntime {
  if (runtime.brokenChains.some((item) => item.dependencyFlagId === chain.dependencyFlagId)) {
    return runtime
  }
  return {
    ...runtime,
    state: 'blocked',
    paused: true,
    brokenChains: [...runtime.brokenChains, chain],
    updatedAt: chain.brokenAt,
  }
}

/** 环境是否已经按某个快照实际推进（已推进环境不受后续配置变更影响） */
export function isEnvironmentAdvanced(runtime: EnvironmentRuntime): boolean {
  return runtime.state !== 'awaiting'
}

/** 计划中是否还有未推进的环境 */
export function planHasPendingEnvironments(plan: ReleasePlan): boolean {
  return plan.environments.some((runtime) => !isEnvironmentAdvanced(runtime))
}

/** 找出计划里实际使用的全部快照 id（环境绑定 + latest） */
export function planSnapshotIds(plan: ReleasePlan): string[] {
  return [
    ...new Set(
      [plan.latestSnapshotId, ...plan.environments.map((runtime) => runtime.snapshotId)].filter(Boolean),
    ),
  ]
}

export function formatRule(rule: SnapshotPayload['audienceRules'][number]): string {
  return `${rule.attribute} ${rule.operator} ${rule.value}${rule.negate ? '（排除）' : ''}`
}
