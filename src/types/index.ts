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

export type SnapshotStatus = 'active' | 'superseded' | 'invalidated'
export type PlanStageStatus = 'completed' | 'running' | 'planned' | 'paused'
export type EnvironmentPlanStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'paused'
  | 'invalidated'
  | 'halted'
export type ReleasePlanStatus = 'in-progress' | 'completed' | 'invalidated' | 'halted'

/** 审批生成的不可变发布快照：受众规则、依赖条件、回滚阈值一经写入不再修改 */
export interface ReleaseSnapshot {
  id: string
  flagId: string
  flagKey: string
  version: number
  status: SnapshotStatus
  approvedBy: string
  approvedAt: string
  comment: string
  environment: Environment
  rolloutPercentage: number
  audienceRules: AudienceRule[]
  dependencies: Dependency[]
  rollbackConditions: string[]
  metricNames: string[]
  regions: string[]
  minClientVersion: Record<Environment, string>
  rolloutSteps: RolloutStep[]
  checksum: string
}

export interface PlanStage {
  id: string
  percentage: number
  audience: string
  guardrails: string[]
  status: PlanStageStatus
  startedAt?: string
  completedAt?: string
}

export interface BrokenLink {
  dependencyFlagId: string
  dependencyKey: string
  dependencyName: string
  reason: string
  detectedAt: string
}

/** 单个环境的发布进度：已推进环境固定按各自快照运行 */
export interface EnvironmentPlan {
  environment: Environment
  snapshotId: string
  status: EnvironmentPlanStatus
  stages: PlanStage[]
  brokenLinks: BrokenLink[]
  updatedAt: string
}

export interface ReleasePlan {
  id: string
  flagId: string
  flagKey: string
  snapshotId: string
  status: ReleasePlanStatus
  environments: EnvironmentPlan[]
  createdAt: string
  updatedAt: string
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
    | 'dependency-broken'
  actor: string
  summary: string
  before?: string
  after?: string
  affectedUsers: number
  createdAt: string
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
  affectedUsers: number
  brokenLinks: number
  invalidatedPlans: number
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
