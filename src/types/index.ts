export type FlagStatus = 'draft' | 'review' | 'active' | 'frozen' | 'rolled-back'
export type Environment = 'dev' | 'staging' | 'production'
export type RuleOperator = 'equals' | 'not-equals' | 'contains' | 'in' | 'gte' | 'lte'
export type IssueSeverity = 'blocker' | 'warning' | 'info'
export type IssueCategory =
  | 'rule-conflict'
  | 'dead-code'
  | 'missing-metric'
  | 'overlap'
  | 'client-compatibility'

export interface AudienceRule {
  id: string
  attribute: string
  operator: RuleOperator
  value: string
  negate: boolean
}

export interface RolloutStep {
  id: string
  percentage: number
  audience: string
  startedAt: string
  status: 'completed' | 'running' | 'planned' | 'paused'
  guardrails: string[]
}

export interface Dependency {
  flagId: string
  type: 'requires' | 'conflicts' | 'fallback'
  condition: string
}

/** 环境推进状态：每个环境独立按其绑定的发布快照运行 */
export type EnvironmentState = 'awaiting' | 'active' | 'completed' | 'rolled-back' | 'blocked'

/** 断链信息：依赖开关被回滚后，环境停止下一阶段 */
export interface BrokenChain {
  dependencyFlagId: string
  dependencyFlagKey: string
  reason: string
  brokenAt: string
}

/** 单个环境的运行态：绑定不可变快照，记录当前阶段与断链 */
export interface EnvironmentRuntime {
  environment: Environment
  state: EnvironmentState
  snapshotId: string
  stepIndex: number
  percentage: number
  paused: boolean
  advancedAt: string
  updatedAt: string
  brokenChains: BrokenChain[]
}

/** 发布计划状态 */
export type PlanStatus = 'awaiting-approval' | 'active' | 'invalidated' | 'completed'

/** 发布计划：跨环境推进，未推进环境会在配置变更后失效重审 */
export interface ReleasePlan {
  id: string
  status: PlanStatus
  latestSnapshotId: string
  invalidatedAt?: string
  invalidatedReason?: string
  environments: EnvironmentRuntime[]
}

/**
 * 不可变发布快照：审批时生成，固化受众规则、依赖条件与回滚阈值。
 * checksum 用于完整性校验，校验失败时从上一个完整快照恢复。
 */
export interface ReleaseSnapshot {
  id: string
  flagId: string
  flagKey: string
  version: number
  configRevision: number
  createdAt: string
  approvedBy: string
  approvalComment: string
  freezeUntil?: string
  checksum: string
  payload: SnapshotPayload
}

export interface SnapshotPayload {
  name: string
  enabled: boolean
  audienceRules: AudienceRule[]
  regions: string[]
  minClientVersion: Record<Environment, string>
  dependencies: Dependency[]
  rollbackConditions: string[]
  rollbackThresholds: string[]
  metricNames: string[]
  rolloutSteps: RolloutStep[]
  initialPercentage: number
}

export interface FeatureFlag {
  id: string
  key: string
  name: string
  description: string
  owner: string
  team: string
  status: FlagStatus
  environment: Environment
  enabled: boolean
  rolloutPercentage: number
  audienceRules: AudienceRule[]
  regions: string[]
  minClientVersion: Record<Environment, string>
  dependencies: Dependency[]
  rollbackConditions: string[]
  metricNames: string[]
  deadCodeStatus: 'clean' | 'candidate' | 'confirmed'
  rolloutSteps: RolloutStep[]
  createdAt: string
  updatedAt: string
  lastChangedBy: string
  /** 审批后每次配置编辑递增；高于快照 configRevision 表示计划需要重审 */
  configRevision: number
  /** 当前发布计划；未推进环境的计划在配置变更后失效 */
  plan: ReleasePlan | null
}

export interface AuditEvent {
  id: string
  flagId: string
  flagKey: string
  action:
    | 'created'
    | 'updated'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'frozen'
    | 'unfrozen'
    | 'rolled-back'
    | 'rollout-adjusted'
    | 'snapshot-created'
    | 'plan-invalidated'
    | 'chain-broken'
  actor: string
  summary: string
  before?: string
  after?: string
  affectedUsers: number
  createdAt: string
  snapshotId?: string
  environments?: Environment[]
}

export interface ImpactIssue {
  id: string
  flagId: string
  flagKey: string
  category: IssueCategory
  severity: IssueSeverity
  title: string
  detail: string
  suggestion: string
  resolved: boolean
}

export interface DashboardData {
  activeFlags: number
  pendingReview: number
  blockerIssues: number
  brokenChains: number
  affectedUsers: number
  environmentDiff: Array<{ flag: string; dev: number; staging: number; production: number }>
  adoptionTrend: Array<{ date: string; flags: number; rollbacks: number }>
}

export interface FlagFilter {
  keyword?: string
  status?: FlagStatus | ''
  environment?: Environment | ''
  team?: string
  owner?: string
}

export interface ReviewPayload {
  reviewer: string
  decision: 'approved' | 'rejected'
  comment: string
  freezeUntil?: string
}
