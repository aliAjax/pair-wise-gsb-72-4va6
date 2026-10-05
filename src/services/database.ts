import type {
  AuditEvent,
  DashboardData,
  Environment,
  EnvironmentPlan,
  FeatureFlag,
  ImpactIssue,
  PlanStage,
  ReleasePlan,
  ReleasePlanStatus,
  ReleaseSnapshot,
  ReviewPayload,
  RolloutStep,
} from '@/types'

const STORAGE_KEY = 'feature-flag-release-console-v1'

export interface Database {
  flags: FeatureFlag[]
  audit: AuditEvent[]
  issues: ImpactIssue[]
  snapshots: ReleaseSnapshot[]
  plans: ReleasePlan[]
}

export const ENVIRONMENTS: Environment[] = ['dev', 'staging', 'production']

export const environmentLabel: Record<Environment, string> = {
  dev: '开发',
  staging: '预发',
  production: '生产',
}

const flags: FeatureFlag[] = [
  {
    id: 'flag-101',
    key: 'checkout.express-pay-v2',
    name: '极速支付流程 V2',
    description: '在结算页启用新的地址确认和支付聚合流程。',
    owner: '陈思远',
    team: '交易体验',
    status: 'review',
    environment: 'staging',
    enabled: false,
    rolloutPercentage: 20,
    audienceRules: [
      { id: 'r-101-1', attribute: 'user.tier', operator: 'in', value: 'gold,platinum', negate: false },
      { id: 'r-101-2', attribute: 'client.platform', operator: 'equals', value: 'ios', negate: false },
      { id: 'r-101-3', attribute: 'account.risk_score', operator: 'lte', value: '40', negate: false },
    ],
    regions: ['CN-EAST', 'CN-SOUTH'],
    minClientVersion: { dev: '8.18.0', staging: '8.18.0', production: '8.18.0' },
    dependencies: [
      { flagId: 'flag-104', type: 'requires', condition: '支付聚合服务已启用' },
      { flagId: 'flag-108', type: 'conflicts', condition: '旧版优惠券浮层不可同时启用' },
    ],
    rollbackConditions: ['支付成功率 5 分钟低于 96%', 'P95 延迟高于 2200ms', '错误率高于 1.2%'],
    metricNames: ['checkout_payment_success_rate', 'checkout_p95_latency'],
    deadCodeStatus: 'candidate',
    rolloutSteps: [
      { id: 's-1', percentage: 1, audience: '内部体验账号', startedAt: '2026-09-25T10:00:00+08:00', status: 'completed', guardrails: ['无阻断错误'] },
      { id: 's-2', percentage: 5, audience: '华东区金卡用户', startedAt: '2026-09-27T14:30:00+08:00', status: 'completed', guardrails: ['支付成功率 > 97%'] },
      { id: 's-3', percentage: 20, audience: 'iOS 金卡及铂金用户', startedAt: '2026-09-29T09:00:00+08:00', status: 'running', guardrails: ['错误率 < 1.2%', 'P95 < 2200ms'] },
      { id: 's-4', percentage: 50, audience: '全量高价值用户', startedAt: '2026-10-02T10:00:00+08:00', status: 'planned', guardrails: ['人工审批'] },
    ],
    createdAt: '2026-09-12T14:20:00+08:00',
    updatedAt: '2026-09-29T09:05:00+08:00',
    lastChangedBy: '陈思远',
  },
  {
    id: 'flag-102',
    key: 'catalog.smart-recommendation',
    name: '商品智能推荐位',
    description: '基于实时意图在商品列表插入推荐模块。',
    owner: '许薇',
    team: '增长算法',
    status: 'active',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 35,
    audienceRules: [
      { id: 'r-102-1', attribute: 'app.version', operator: 'gte', value: '9.2.0', negate: false },
      { id: 'r-102-2', attribute: 'user.segment', operator: 'in', value: 'active,high_intent', negate: false },
    ],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH'],
    minClientVersion: { dev: '9.1.0', staging: '9.2.0', production: '9.2.0' },
    dependencies: [{ flagId: 'flag-105', type: 'requires', condition: '特征服务延迟稳定在 80ms 内' }],
    rollbackConditions: ['推荐模块点击率下降 15%', '接口超时率高于 2%'],
    metricNames: ['recommend_ctr', 'feature_service_timeout_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [
      { id: 's-201', percentage: 10, audience: '活跃用户', startedAt: '2026-09-20T10:00:00+08:00', status: 'completed', guardrails: ['CTR 不低于对照 5%'] },
      { id: 's-202', percentage: 35, audience: '活跃及高意图用户', startedAt: '2026-09-27T10:00:00+08:00', status: 'running', guardrails: ['接口超时率 < 2%'] },
    ],
    createdAt: '2026-08-28T09:30:00+08:00',
    updatedAt: '2026-09-28T16:40:00+08:00',
    lastChangedBy: '周启',
  },
  {
    id: 'flag-103',
    key: 'console.billing-export-v3',
    name: '账单异步导出 V3',
    description: '把大账单导出切换至异步任务和对象存储下载。',
    owner: '周航',
    team: '云控制台',
    status: 'review',
    environment: 'dev',
    enabled: false,
    rolloutPercentage: 0,
    audienceRules: [
      { id: 'r-103-1', attribute: 'account.type', operator: 'equals', value: 'enterprise', negate: false },
    ],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '5.10.0', staging: '5.10.0', production: '5.10.0' },
    dependencies: [{ flagId: 'flag-107', type: 'requires', condition: '异步任务队列容量已扩容' }],
    rollbackConditions: ['任务失败率高于 3%', '导出文件超过 24 小时未生成'],
    metricNames: [],
    deadCodeStatus: 'candidate',
    rolloutSteps: [
      { id: 's-301', percentage: 5, audience: '内部测试企业', startedAt: '2026-10-08T10:00:00+08:00', status: 'planned', guardrails: ['任务成功率 > 98%'] },
    ],
    createdAt: '2026-09-18T11:10:00+08:00',
    updatedAt: '2026-09-28T18:20:00+08:00',
    lastChangedBy: '周航',
  },
  {
    id: 'flag-104',
    key: 'payment.aggregate-router',
    name: '支付聚合路由',
    description: '统一收单渠道和支付降级策略。',
    owner: '韩秋',
    team: '支付平台',
    status: 'active',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 100,
    audienceRules: [],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH', 'CN-WEST'],
    minClientVersion: { dev: '8.12.0', staging: '8.12.0', production: '8.12.0' },
    dependencies: [],
    rollbackConditions: ['任一收单渠道连续失败 20 次'],
    metricNames: ['payment_router_error_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-401', percentage: 100, audience: '全部用户', startedAt: '2026-07-01T00:00:00+08:00', status: 'completed', guardrails: [] }],
    createdAt: '2026-06-12T10:00:00+08:00',
    updatedAt: '2026-09-25T12:30:00+08:00',
    lastChangedBy: '韩秋',
  },
  {
    id: 'flag-105',
    key: 'feature.realtime-profile',
    name: '实时用户特征服务',
    description: '向推荐和搜索模块提供实时画像特征。',
    owner: '郭宁',
    team: '数据平台',
    status: 'frozen',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 60,
    audienceRules: [],
    regions: ['CN-EAST', 'CN-SOUTH'],
    minClientVersion: { dev: '1.0.0', staging: '1.0.0', production: '1.0.0' },
    dependencies: [],
    rollbackConditions: ['P99 延迟高于 350ms'],
    metricNames: ['feature_service_latency', 'feature_cache_hit_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-501', percentage: 60, audience: '推荐服务流量', startedAt: '2026-09-28T09:00:00+08:00', status: 'paused', guardrails: ['观察缓存命中率'] }],
    createdAt: '2026-05-18T13:40:00+08:00',
    updatedAt: '2026-09-29T08:50:00+08:00',
    lastChangedBy: '郭宁',
  },
  {
    id: 'flag-106',
    key: 'campaign.new-editor',
    name: '活动配置新版编辑器',
    description: '提供拖拽式活动页面配置能力。',
    owner: '梁琪',
    team: '增长运营',
    status: 'rolled-back',
    environment: 'production',
    enabled: false,
    rolloutPercentage: 0,
    audienceRules: [{ id: 'r-106-1', attribute: 'operator.role', operator: 'equals', value: 'campaign_admin', negate: false }],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '2.6.0', staging: '2.6.0', production: '2.6.0' },
    dependencies: [],
    rollbackConditions: ['配置保存失败率高于 2%'],
    metricNames: ['campaign_editor_save_success'],
    deadCodeStatus: 'confirmed',
    rolloutSteps: [{ id: 's-601', percentage: 20, audience: '华东运营团队', startedAt: '2026-09-27T14:00:00+08:00', status: 'paused', guardrails: [] }],
    createdAt: '2026-08-20T10:15:00+08:00',
    updatedAt: '2026-09-28T15:48:00+08:00',
    lastChangedBy: '梁琪',
  },
  {
    id: 'flag-107',
    key: 'infra.async-task-queue-v2',
    name: '异步任务队列 V2',
    description: '迁移长任务至高吞吐队列。',
    owner: '赵岚',
    team: '基础架构',
    status: 'active',
    environment: 'staging',
    enabled: true,
    rolloutPercentage: 100,
    audienceRules: [],
    regions: ['CN-EAST'],
    minClientVersion: { dev: '1.0.0', staging: '1.0.0', production: '1.0.0' },
    dependencies: [],
    rollbackConditions: ['队列积压超过 10 万'],
    metricNames: ['queue_backlog', 'task_failure_rate'],
    deadCodeStatus: 'clean',
    rolloutSteps: [{ id: 's-701', percentage: 100, audience: '预发长任务', startedAt: '2026-09-22T09:00:00+08:00', status: 'completed', guardrails: [] }],
    createdAt: '2026-08-10T16:20:00+08:00',
    updatedAt: '2026-09-27T11:12:00+08:00',
    lastChangedBy: '赵岚',
  },
  {
    id: 'flag-108',
    key: 'checkout.legacy-coupon-overlay',
    name: '旧版优惠券浮层',
    description: '结算页旧优惠券选择浮层，计划下版本下线。',
    owner: '沈宁',
    team: '交易体验',
    status: 'frozen',
    environment: 'production',
    enabled: true,
    rolloutPercentage: 12,
    audienceRules: [{ id: 'r-108-1', attribute: 'app.version', operator: 'lte', value: '8.17.9', negate: false }],
    regions: ['CN-EAST', 'CN-NORTH', 'CN-SOUTH'],
    minClientVersion: { dev: '8.10.0', staging: '8.10.0', production: '8.10.0' },
    dependencies: [{ flagId: 'flag-101', type: 'conflicts', condition: '新版支付流程不可同时启用' }],
    rollbackConditions: ['优惠券使用率下降 10%'],
    metricNames: ['coupon_apply_success_rate'],
    deadCodeStatus: 'confirmed',
    rolloutSteps: [{ id: 's-801', percentage: 12, audience: '低版本客户端', startedAt: '2026-09-20T09:00:00+08:00', status: 'paused', guardrails: [] }],
    createdAt: '2025-12-10T09:00:00+08:00',
    updatedAt: '2026-09-29T09:10:00+08:00',
    lastChangedBy: '沈宁',
  },
]

const issues: ImpactIssue[] = [
  {
    id: 'issue-1',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    category: 'overlap',
    severity: 'blocker',
    title: '与旧版优惠券实验组重叠',
    detail: '20% 灰度人群中有 3.8% 同时命中 checkout.legacy-coupon-overlay。',
    suggestion: '将 risk_score <= 40 与旧版浮层实验排除条件合并，或先将旧开关灰度降至 0。',
    resolved: false,
  },
  {
    id: 'issue-2',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    category: 'client-compatibility',
    severity: 'warning',
    title: '低版本客户端缺少聚合支付能力',
    detail: 'iOS 8.17.x 用户仍会命中新流程，但客户端未注册 pay.aggregate.v2。',
    suggestion: '把 app.version >= 8.18.0 加入受众前置条件。',
    resolved: false,
  },
  {
    id: 'issue-3',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    category: 'missing-metric',
    severity: 'blocker',
    title: '缺少下载完成率监控',
    detail: '当前仅配置任务创建指标，无法自动触发导出文件生成失败回滚。',
    suggestion: '接入 billing_export_download_success_rate 并配置 15 分钟窗口。',
    resolved: false,
  },
  {
    id: 'issue-4',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    category: 'dead-code',
    severity: 'warning',
    title: '旧同步导出入口仍可达',
    detail: '代码扫描发现 feature.billing_export_sync 分支仍被路由引用。',
    suggestion: '提供旧入口下线任务，并在新开关全量后移除分支。',
    resolved: false,
  },
  {
    id: 'issue-5',
    flagId: 'flag-106',
    flagKey: 'campaign.new-editor',
    category: 'rule-conflict',
    severity: 'warning',
    title: '保存权限中存在互斥角色条件',
    detail: '角色 equals campaign_admin 与后续 not-equals 临时审核员规则同时存在。',
    suggestion: '合并为明确的白名单，避免规则求值顺序变化。',
    resolved: true,
  },
  {
    id: 'issue-6',
    flagId: 'flag-108',
    flagKey: 'checkout.legacy-coupon-overlay',
    category: 'dead-code',
    severity: 'info',
    title: '开关已进入下线候选',
    detail: '最近 30 天没有新增代码引用，仅保留旧客户端兼容分支。',
    suggestion: '在最低客户端版本达到 8.18.0 后安排代码清理。',
    resolved: false,
  },
]

const audit: AuditEvent[] = [
  {
    id: 'audit-1',
    flagId: 'flag-101',
    flagKey: 'checkout.express-pay-v2',
    action: 'rollout-adjusted',
    actor: '陈思远',
    summary: '灰度比例由 5% 调整至 20%，仅覆盖 iOS 金卡及铂金用户。',
    before: '5%',
    after: '20%',
    affectedUsers: 48620,
    createdAt: '2026-09-29T09:05:00+08:00',
  },
  {
    id: 'audit-2',
    flagId: 'flag-105',
    flagKey: 'feature.realtime-profile',
    action: 'frozen',
    actor: '郭宁',
    summary: 'P99 延迟升高，冻结配置并暂停扩大流量。',
    before: 'active',
    after: 'frozen',
    affectedUsers: 1200000,
    createdAt: '2026-09-29T08:50:00+08:00',
  },
  {
    id: 'audit-3',
    flagId: 'flag-106',
    flagKey: 'campaign.new-editor',
    action: 'rolled-back',
    actor: '梁琪',
    summary: '配置保存失败率触发自动回滚条件。',
    before: '20%',
    after: '0%',
    affectedUsers: 638,
    createdAt: '2026-09-28T15:48:00+08:00',
  },
  {
    id: 'audit-4',
    flagId: 'flag-102',
    flagKey: 'catalog.smart-recommendation',
    action: 'rollout-adjusted',
    actor: '周启',
    summary: '灰度扩大到 35%，推荐接口错误率保持低于阈值。',
    before: '20%',
    after: '35%',
    affectedUsers: 812430,
    createdAt: '2026-09-28T16:40:00+08:00',
  },
  {
    id: 'audit-5',
    flagId: 'flag-103',
    flagKey: 'console.billing-export-v3',
    action: 'submitted',
    actor: '周航',
    summary: '提交发布评审，等待补齐导出完成率监控。',
    before: 'draft',
    after: 'draft',
    affectedUsers: 0,
    createdAt: '2026-09-28T18:20:00+08:00',
  },
  {
    id: 'audit-6',
    flagId: 'flag-104',
    flagKey: 'payment.aggregate-router',
    action: 'approved',
    actor: '林默',
    summary: '确认回滚条件和支付通道指标完整。',
    before: 'review',
    after: 'active',
    affectedUsers: 3200000,
    createdAt: '2026-09-25T12:30:00+08:00',
  },
]

/* ------------------------------------------------------------------ */
/* 发布快照与计划：构造、校验、恢复                                       */
/* ------------------------------------------------------------------ */

const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const nowIso = () => new Date().toISOString()

let auditSequence = 0

const appendAudit = (db: Database, event: Omit<AuditEvent, 'id' | 'createdAt'>): void => {
  auditSequence += 1
  db.audit.unshift({ ...event, id: `audit-${Date.now()}-${auditSequence}`, createdAt: nowIso() })
}

/** 快照内容指纹：内容不可变，任何改动都会破坏校验和 */
const checksumOf = (value: unknown): string => {
  const text = JSON.stringify(value)
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  }
  return hash.toString(16)
}

/**
 * 纳入快照封存与漂移检测的配置项：受众规则、依赖条件、回滚阈值等。
 * 灰度阶段只封存定义（比例、人群、守护），运行状态不属于配置内容，
 * 冻结/回滚改变阶段状态不会误判为配置漂移。
 */
const snapshotContent = (flag: FeatureFlag) => ({
  environment: flag.environment,
  audienceRules: flag.audienceRules,
  dependencies: flag.dependencies,
  rollbackConditions: flag.rollbackConditions,
  metricNames: flag.metricNames,
  regions: flag.regions,
  minClientVersion: flag.minClientVersion,
  rolloutSteps: flag.rolloutSteps.map((step) => ({
    id: step.id,
    percentage: step.percentage,
    audience: step.audience,
    guardrails: step.guardrails,
    startedAt: step.startedAt,
  })),
})

const snapshotContentFromSnapshot = (snapshot: ReleaseSnapshot) => ({
  environment: snapshot.environment,
  audienceRules: snapshot.audienceRules,
  dependencies: snapshot.dependencies,
  rollbackConditions: snapshot.rollbackConditions,
  metricNames: snapshot.metricNames,
  regions: snapshot.regions,
  minClientVersion: snapshot.minClientVersion,
  rolloutSteps: snapshot.rolloutSteps.map((step) => ({
    id: step.id,
    percentage: step.percentage,
    audience: step.audience,
    guardrails: step.guardrails,
    startedAt: step.startedAt,
  })),
})

const snapshotChecksum = (flagId: string, version: number, flag: FeatureFlag): string =>
  checksumOf({ flagId, version, ...snapshotContent(flag) })

export const verifySnapshot = (snapshot: ReleaseSnapshot): boolean =>
  snapshot.checksum === checksumOf({ flagId: snapshot.flagId, version: snapshot.version, ...snapshotContentFromSnapshot(snapshot) })

/** 判断当前配置是否已偏离某个审批快照 */
export const flagDriftedFromSnapshot = (snapshot: ReleaseSnapshot, flag: FeatureFlag): boolean =>
  snapshot.checksum !== snapshotChecksum(flag.id, snapshot.version, flag)

const buildSnapshot = (
  flag: FeatureFlag,
  version: number,
  actor: string,
  comment: string,
  approvedAt = nowIso(),
): ReleaseSnapshot => ({
  id: `snap-${flag.id}-v${version}`,
  flagId: flag.id,
  flagKey: flag.key,
  version,
  status: 'active',
  approvedBy: actor,
  approvedAt,
  comment,
  rolloutPercentage: flag.rolloutPercentage,
  environment: flag.environment,
  audienceRules: deepCopy(flag.audienceRules),
  dependencies: deepCopy(flag.dependencies),
  rollbackConditions: [...flag.rollbackConditions],
  metricNames: [...flag.metricNames],
  regions: [...flag.regions],
  minClientVersion: { ...flag.minClientVersion },
  rolloutSteps: deepCopy(flag.rolloutSteps),
  checksum: snapshotChecksum(flag.id, version, flag),
})

const stageFromStep = (step: RolloutStep, status: PlanStage['status']): PlanStage => ({
  id: step.id,
  percentage: step.percentage,
  audience: step.audience,
  guardrails: [...step.guardrails],
  status,
})

const buildStagesFromSnapshot = (snapshot: ReleaseSnapshot): PlanStage[] =>
  snapshot.rolloutSteps.map((step) => stageFromStep(step, 'planned'))

/** 环境是否已推进：只要存在已开始的阶段，就固定按当前快照运行 */
export const isEnvironmentAdvanced = (plan: EnvironmentPlan): boolean =>
  plan.stages.some((stage) => stage.status !== 'planned')

const environmentStatusFromStages = (stages: PlanStage[]): EnvironmentPlan['status'] => {
  if (stages.length === 0) return 'pending'
  if (stages.every((stage) => stage.status === 'completed')) return 'completed'
  if (stages.some((stage) => stage.status === 'running')) return 'in-progress'
  if (stages.some((stage) => stage.status === 'paused')) return 'paused'
  return 'pending'
}

const derivePlanStatus = (environments: EnvironmentPlan[]): ReleasePlanStatus => {
  if (environments.length > 0 && environments.every((env) => env.status === 'completed')) return 'completed'
  if (environments.length > 0 && environments.every((env) => env.status === 'invalidated')) return 'invalidated'
  if (environments.some((env) => env.status === 'halted')) return 'halted'
  return 'in-progress'
}

const emptyEnvironmentPlan = (environment: Environment, snapshot: ReleaseSnapshot): EnvironmentPlan => ({
  environment,
  snapshotId: snapshot.id,
  status: 'pending',
  stages: buildStagesFromSnapshot(snapshot),
  brokenLinks: [],
  updatedAt: nowIso(),
})

/** 首次审批 / 历史数据迁移：按开关当前真实进度生成计划，已推进阶段保留状态 */
const buildHistoricalPlan = (flag: FeatureFlag, snapshot: ReleaseSnapshot): ReleasePlan => {
  const flagEnvironmentIndex = ENVIRONMENTS.indexOf(flag.environment)
  const environments: EnvironmentPlan[] = ENVIRONMENTS.map((environment, index) => {
    let stages: PlanStage[]
    if (index < flagEnvironmentIndex) {
      stages = snapshot.rolloutSteps.map((step) => stageFromStep(step, 'completed'))
    } else if (index === flagEnvironmentIndex) {
      stages = snapshot.rolloutSteps.map((step) =>
        stageFromStep(
          step,
          step.status === 'completed' || step.status === 'running' || step.status === 'paused'
            ? step.status
            : 'planned',
        ),
      )
    } else {
      stages = buildStagesFromSnapshot(snapshot)
    }
    return {
      environment,
      snapshotId: snapshot.id,
      status: environmentStatusFromStages(stages),
      stages,
      brokenLinks: [],
      updatedAt: nowIso(),
    }
  })
  const plan: ReleasePlan = {
    id: `plan-${flag.id}`,
    flagId: flag.id,
    flagKey: flag.key,
    snapshotId: snapshot.id,
    status: derivePlanStatus(environments),
    environments,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  if (flag.status === 'rolled-back') {
    plan.environments.forEach((env) => {
      if (env.status !== 'completed') env.status = 'halted'
    })
    plan.status = derivePlanStatus(plan.environments)
  }
  return plan
}

const latestCompleteSnapshot = (db: Database, flagId: string): ReleaseSnapshot | undefined =>
  db.snapshots
    .filter((snapshot) => snapshot.flagId === flagId)
    .sort((left, right) => right.version - left.version)[0]

const seedSnapshotsAndPlans = (seedFlags: FeatureFlag[]): { snapshots: ReleaseSnapshot[]; plans: ReleasePlan[] } => {
  const snapshots: ReleaseSnapshot[] = []
  const plans: ReleasePlan[] = []
  seedFlags.forEach((flag) => {
    if (flag.status === 'active' || flag.status === 'frozen' || flag.status === 'rolled-back') {
      const snapshot = buildSnapshot(flag, 1, flag.lastChangedBy, '基线审批快照', flag.updatedAt)
      snapshots.push(snapshot)
      plans.push(buildHistoricalPlan(flag, snapshot))
    }
  })
  return { snapshots, plans }
}

export const seedDatabase = (): Database => {
  const { snapshots, plans } = seedSnapshotsAndPlans(flags)
  return deepCopy({ flags, audit, issues, snapshots, plans })
}

/** 旧版本数据迁移：没有快照概念的数据，为已审批过的开关补建基线快照与计划 */
const migrateDatabase = (raw: Partial<Database>): Database => {
  const db: Database = {
    flags: Array.isArray(raw.flags) ? raw.flags : [],
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
    plans: Array.isArray(raw.plans) ? raw.plans : [],
  }
  if (!Array.isArray(raw.snapshots) || !Array.isArray(raw.plans)) {
    const seeded = seedSnapshotsAndPlans(db.flags)
    db.snapshots = seeded.snapshots
    db.plans = seeded.plans
  }
  return db
}

/** 启动时修复：残缺快照与半套计划一律回退，从上一个完整快照继续 */
const recoverDatabase = (db: Database): boolean => {
  let repaired = false
  const validSnapshots = db.snapshots.filter(verifySnapshot)
  if (validSnapshots.length !== db.snapshots.length) {
    db.snapshots = validSnapshots
    repaired = true
  }
  const snapshotIds = new Set(db.snapshots.map((snapshot) => snapshot.id))
  db.plans = db.plans.filter((plan) => {
    if (!db.flags.some((flag) => flag.id === plan.flagId)) {
      repaired = true
      return false
    }
    const fallback = latestCompleteSnapshot(db, plan.flagId)
    if (!fallback) {
      // 没有任何完整快照可用，半套计划直接移除
      repaired = true
      return false
    }
    if (!snapshotIds.has(plan.snapshotId)) {
      plan.snapshotId = fallback.id
      repaired = true
    }
    plan.environments.forEach((env) => {
      if (snapshotIds.has(env.snapshotId)) return
      const previousStages = Array.isArray(env.stages) ? env.stages : []
      env.snapshotId = fallback.id
      env.stages = fallback.rolloutSteps.map((step) => {
        const previous = previousStages.find((stage) => stage.id === step.id)
        return stageFromStep(step, previous?.status ?? 'planned')
      })
      env.brokenLinks = []
      env.status = environmentStatusFromStages(env.stages)
      env.updatedAt = nowIso()
      repaired = true
    })
    plan.status = derivePlanStatus(plan.environments)
    plan.updatedAt = nowIso()
    return true
  })
  return repaired
}

export const readDatabase = (): Database => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
  try {
    const db = migrateDatabase(JSON.parse(raw) as Partial<Database>)
    if (recoverDatabase(db)) writeDatabase(db)
    return db
  } catch {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
}

export const writeDatabase = (database: Database): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

/** 写入前完整性校验：任何快照或计划引用缺失都放弃本次写入 */
const assertIntegrity = (db: Database): void => {
  const snapshotIds = new Set(db.snapshots.map((snapshot) => snapshot.id))
  for (const snapshot of db.snapshots) {
    if (!verifySnapshot(snapshot)) {
      throw new Error(`快照 ${snapshot.id} 内容校验失败，已放弃本次写入`)
    }
  }
  for (const plan of db.plans) {
    if (!snapshotIds.has(plan.snapshotId)) {
      throw new Error(`发布计划 ${plan.id} 引用的快照缺失，已放弃本次写入`)
    }
    for (const env of plan.environments) {
      if (!snapshotIds.has(env.snapshotId)) {
        throw new Error(`${environmentLabel[env.environment]}环境计划引用的快照缺失，已放弃本次写入`)
      }
    }
  }
}

/**
 * 事务化写入：先在内存副本上完成全部变更并通过完整性校验，
 * 最后一次落盘；任何一步失败都不写盘，不会留下半套计划。
 */
const transaction = <T>(mutate: (db: Database) => T): T => {
  const db = readDatabase()
  const result = mutate(db)
  assertIntegrity(db)
  writeDatabase(db)
  return result
}

/* ------------------------------------------------------------------ */
/* 业务操作                                                             */
/* ------------------------------------------------------------------ */

export const applyReview = (
  flagId: string,
  payload: ReviewPayload,
): { flag: FeatureFlag; snapshot: ReleaseSnapshot | null } =>
  transaction((db) => {
    const flag = db.flags.find((item) => item.id === flagId)
    if (!flag) throw new Error('功能开关不存在')
    const before = flag.status
    const now = nowIso()
    flag.updatedAt = now
    flag.lastChangedBy = payload.reviewer

    if (payload.decision !== 'approved') {
      flag.status = 'draft'
      flag.enabled = false
      appendAudit(db, {
        flagId,
        flagKey: flag.key,
        action: 'rejected',
        actor: payload.reviewer,
        summary: payload.comment,
        before,
        after: flag.status,
        affectedUsers: 0,
      })
      return { flag, snapshot: null }
    }

    if (payload.freezeUntil) {
      flag.rollbackConditions.push(`冻结至 ${payload.freezeUntil}，期间禁止扩大流量`)
    }
    flag.status = 'active'
    flag.enabled = true

    // 每次批准生成不可变快照：受众规则、依赖条件、回滚阈值一并封存
    const version =
      db.snapshots
        .filter((snapshot) => snapshot.flagId === flagId)
        .reduce((max, snapshot) => Math.max(max, snapshot.version), 0) + 1
    const snapshot = buildSnapshot(flag, version, payload.reviewer, payload.comment, now)
    db.snapshots.forEach((item) => {
      if (item.flagId === flagId && item.status === 'active') item.status = 'superseded'
    })
    db.snapshots.unshift(snapshot)

    // 发布计划：未推进环境换绑新快照，已推进环境继续按各自快照运行
    const existingPlan = db.plans.find((item) => item.flagId === flagId)
    if (!existingPlan) {
      db.plans.unshift(buildHistoricalPlan(flag, snapshot))
    } else {
      const plan = existingPlan
      plan.snapshotId = snapshot.id
      plan.environments.forEach((env) => {
        if (isEnvironmentAdvanced(env)) return
        env.snapshotId = snapshot.id
        env.stages = buildStagesFromSnapshot(snapshot)
        env.status = 'pending'
        env.brokenLinks = []
        env.updatedAt = now
      })
      ENVIRONMENTS.forEach((environment) => {
        if (!plan.environments.some((env) => env.environment === environment)) {
          plan.environments.push(emptyEnvironmentPlan(environment, snapshot))
        }
      })
      plan.status = derivePlanStatus(plan.environments)
      plan.updatedAt = now
    }

    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'approved',
      actor: payload.reviewer,
      summary: payload.comment,
      before,
      after: flag.status,
      affectedUsers: Math.round(120000 * (flag.rolloutPercentage / 100)),
    })
    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'snapshot-created',
      actor: payload.reviewer,
      summary: `生成不可变发布快照 v${version}：受众规则 ${snapshot.audienceRules.length} 条、依赖条件 ${snapshot.dependencies.length} 项、回滚阈值 ${snapshot.rollbackConditions.length} 条。`,
      before,
      after: `snapshot v${version}`,
      affectedUsers: 0,
    })
    return { flag, snapshot }
  })

export const saveFlagConfig = (
  input: FeatureFlag,
): { flag: FeatureFlag; invalidatedEnvironments: Environment[] } =>
  transaction((db) => {
    const now = nowIso()
    const next = { ...input, updatedAt: now }
    const index = db.flags.findIndex((item) => item.id === input.id)
    const invalidatedEnvironments: Environment[] = []

    if (index < 0) {
      db.flags.unshift(next)
      appendAudit(db, {
        flagId: next.id,
        flagKey: next.key,
        action: 'created',
        actor: next.lastChangedBy,
        summary: '创建功能开关草稿。',
        after: next.status,
        affectedUsers: 0,
      })
      return { flag: next, invalidatedEnvironments }
    }

    const before = db.flags[index]
    db.flags[index] = next
    appendAudit(db, {
      flagId: next.id,
      flagKey: next.key,
      action: 'updated',
      actor: next.lastChangedBy,
      summary: '更新开关受众、依赖、版本或回滚条件。',
      before: before.status,
      after: next.status,
      affectedUsers: Math.round(900000 * (next.rolloutPercentage / 100)),
    })

    // 审批后配置更新：未推进环境的发布计划失效重审，已推进环境继续按各自快照运行
    const activeSnapshot =
      db.snapshots.find((snapshot) => snapshot.flagId === next.id && snapshot.status === 'active') ??
      latestCompleteSnapshot(db, next.id)
    const plan = db.plans.find((item) => item.flagId === next.id)
    if (activeSnapshot && plan && flagDriftedFromSnapshot(activeSnapshot, next)) {
      plan.environments.forEach((env) => {
        if (isEnvironmentAdvanced(env) || env.status === 'invalidated' || env.status === 'halted') return
        env.status = 'invalidated'
        env.updatedAt = now
        invalidatedEnvironments.push(env.environment)
      })
      if (invalidatedEnvironments.length > 0) {
        plan.status = derivePlanStatus(plan.environments)
        plan.updatedAt = now
        next.status = 'review'
        db.flags[index] = next
        appendAudit(db, {
          flagId: next.id,
          flagKey: next.key,
          action: 'plan-invalidated',
          actor: next.lastChangedBy,
          summary: `审批后配置发生变更，${invalidatedEnvironments.map((env) => environmentLabel[env]).join('、')}环境发布计划失效，需重新评审；已推进环境继续按原快照运行。`,
          before: before.status,
          after: 'review',
          affectedUsers: 0,
        })
      }
    }
    return { flag: next, invalidatedEnvironments }
  })

export const submitFlagForReview = (flagId: string, actor: string): FeatureFlag =>
  transaction((db) => {
    const flag = db.flags.find((item) => item.id === flagId)
    if (!flag) throw new Error('功能开关不存在')
    const before = flag.status
    flag.status = 'review'
    flag.updatedAt = nowIso()
    flag.lastChangedBy = actor
    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'submitted',
      actor,
      summary: '提交发布影响评审。',
      before,
      after: 'review',
      affectedUsers: Math.round(900000 * (flag.rolloutPercentage / 100)),
    })
    return flag
  })

const currentStagePercentage = (env: EnvironmentPlan): number => {
  const active = [...env.stages]
    .reverse()
    .find((stage) => stage.status === 'running' || stage.status === 'completed')
  return active?.percentage ?? 0
}

export const advanceEnvironment = (flagId: string, environment: Environment, actor: string): ReleasePlan =>
  transaction((db) => {
    const flag = db.flags.find((item) => item.id === flagId)
    if (!flag) throw new Error('功能开关不存在')
    const plan = db.plans.find((item) => item.flagId === flagId)
    if (!plan) throw new Error('发布计划不存在，请先完成审批生成快照')
    const env = plan.environments.find((item) => item.environment === environment)
    if (!env) throw new Error('该环境暂无发布计划')
    if (env.status === 'invalidated') throw new Error('该环境发布计划已失效，需重新评审后再推进')
    if (env.status === 'halted') throw new Error('该环境已因回滚停止，无法推进')
    if (env.status === 'paused') throw new Error('该环境处于冻结状态，无法推进')
    if (env.status === 'completed') throw new Error('该环境全部阶段已完成')
    if (env.brokenLinks.length > 0) {
      throw new Error(`依赖 ${env.brokenLinks.map((link) => link.dependencyKey).join('、')} 已回滚，断链未处理，已停止推进`)
    }
    const snapshot = db.snapshots.find((item) => item.id === env.snapshotId)
    if (!snapshot) throw new Error('环境运行快照缺失，已停止推进')

    const now = nowIso()
    const beforePercentage = currentStagePercentage(env)
    const running = env.stages.find((stage) => stage.status === 'running')
    if (running) {
      running.status = 'completed'
      running.completedAt = now
    }
    const next = env.stages.find((stage) => stage.status === 'planned')
    if (next) {
      next.status = 'running'
      next.startedAt = now
      env.status = 'in-progress'
    } else {
      env.status = 'completed'
    }
    env.updatedAt = now
    plan.status = derivePlanStatus(plan.environments)
    plan.updatedAt = now

    const afterPercentage = currentStagePercentage(env)
    if (environment === flag.environment) {
      flag.rolloutPercentage = afterPercentage
      flag.enabled = true
      if (flag.status !== 'frozen') flag.status = 'active'
      flag.updatedAt = now
      flag.lastChangedBy = actor
    }
    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'rollout-adjusted',
      actor,
      summary: `${environmentLabel[environment]}环境按快照 v${snapshot.version} 推进至 ${afterPercentage}%。`,
      before: `${beforePercentage}%`,
      after: `${afterPercentage}%`,
      affectedUsers: Math.round(900000 * (afterPercentage / 100)),
    })
    return plan
  })

export const freezeRollout = (flagId: string, actor: string): FeatureFlag =>
  transaction((db) => {
    const flag = db.flags.find((item) => item.id === flagId)
    if (!flag) throw new Error('功能开关不存在')
    const now = nowIso()
    const before = flag.status
    flag.status = 'frozen'
    flag.updatedAt = now
    flag.lastChangedBy = actor
    flag.rolloutSteps.forEach((step) => {
      if (step.status === 'running') step.status = 'paused'
    })
    const plan = db.plans.find((item) => item.flagId === flagId)
    plan?.environments.forEach((env) => {
      let touched = false
      env.stages.forEach((stage) => {
        if (stage.status === 'running') {
          stage.status = 'paused'
          touched = true
        }
      })
      if (touched || env.status === 'in-progress') {
        env.status = 'paused'
        env.updatedAt = now
      }
    })
    if (plan) {
      plan.status = derivePlanStatus(plan.environments)
      plan.updatedAt = now
    }
    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'frozen',
      actor,
      summary: '冻结灰度流量，运行中阶段全部暂停。',
      before,
      after: 'frozen',
      affectedUsers: Math.round(900000 * (flag.rolloutPercentage / 100)),
    })
    return flag
  })

export const rollbackFlag = (
  flagId: string,
  actor: string,
  reason: string,
): { flag: FeatureFlag; impactedPlans: string[] } =>
  transaction((db) => {
    const flag = db.flags.find((item) => item.id === flagId)
    if (!flag) throw new Error('功能开关不存在')
    const now = nowIso()
    const before = `${flag.status} / ${flag.rolloutPercentage}%`
    const affectedUsers = Math.round(980000 * (flag.rolloutPercentage / 100))
    flag.status = 'rolled-back'
    flag.enabled = false
    flag.rolloutPercentage = 0
    flag.updatedAt = now
    flag.lastChangedBy = actor
    flag.rolloutSteps.forEach((step) => {
      if (step.status === 'running') step.status = 'paused'
    })

    // 自身发布计划停止推进
    const ownPlan = db.plans.find((item) => item.flagId === flagId)
    ownPlan?.environments.forEach((env) => {
      env.stages.forEach((stage) => {
        if (stage.status === 'running') stage.status = 'paused'
      })
      if (env.status !== 'completed') {
        env.status = 'halted'
        env.updatedAt = now
      }
    })
    if (ownPlan) {
      ownPlan.status = derivePlanStatus(ownPlan.environments)
      ownPlan.updatedAt = now
    }

    // 依赖它的发布计划：按环境标出断链并停止下一阶段
    const impactedPlans: string[] = []
    db.plans.forEach((plan) => {
      if (plan.flagId === flagId) return
      const impactedEnvironments: string[] = []
      plan.environments.forEach((env) => {
        if (env.status === 'completed' || env.status === 'halted') return
        const snapshot = db.snapshots.find((item) => item.id === env.snapshotId)
        if (!snapshot) return
        const dependency = snapshot.dependencies.find(
          (item) => item.flagId === flagId && (item.type === 'requires' || item.type === 'fallback'),
        )
        if (!dependency) return
        if (env.brokenLinks.some((link) => link.dependencyFlagId === flagId)) return
        env.brokenLinks.push({
          dependencyFlagId: flagId,
          dependencyKey: flag.key,
          dependencyName: flag.name,
          reason: `依赖开关已回滚：${reason}`,
          detectedAt: now,
        })
        env.updatedAt = now
        impactedEnvironments.push(environmentLabel[env.environment])
      })
      if (impactedEnvironments.length > 0) {
        plan.updatedAt = now
        impactedPlans.push(plan.flagKey)
        appendAudit(db, {
          flagId: plan.flagId,
          flagKey: plan.flagKey,
          action: 'dependency-broken',
          actor,
          summary: `依赖开关 ${flag.key} 已回滚，${impactedEnvironments.join('、')}环境出现断链，下一阶段已停止。`,
          before: plan.status,
          after: '断链',
          affectedUsers: 0,
        })
      }
    })

    appendAudit(db, {
      flagId,
      flagKey: flag.key,
      action: 'rolled-back',
      actor,
      summary: reason,
      before,
      after: 'rolled-back / 0%',
      affectedUsers,
    })
    return { flag, impactedPlans }
  })

export const resolveIssue = (issueId: string, actor: string): ImpactIssue =>
  transaction((db) => {
    const issue = db.issues.find((item) => item.id === issueId)
    if (!issue) throw new Error('影响问题不存在')
    issue.resolved = true
    appendAudit(db, {
      flagId: issue.flagId,
      flagKey: issue.flagKey,
      action: 'updated',
      actor,
      summary: `影响问题「${issue.title}」已标记解决。`,
      affectedUsers: 0,
    })
    return issue
  })

export const getDashboardStats = (): DashboardData => {
  const db = readDatabase()
  return {
    activeFlags: db.flags.filter((flag) => flag.enabled).length,
    pendingReview: db.flags.filter((flag) => flag.status === 'review').length + 2,
    blockerIssues: db.issues.filter((issue) => issue.severity === 'blocker' && !issue.resolved).length,
    affectedUsers: 5246900,
    brokenLinks: db.plans.reduce(
      (sum, plan) => sum + plan.environments.reduce((inner, env) => inner + env.brokenLinks.length, 0),
      0,
    ),
    invalidatedPlans: db.plans.filter((plan) =>
      plan.environments.some((env) => env.status === 'invalidated'),
    ).length,
    environmentDiff: [
      { flag: '极速支付流程 V2', dev: 100, staging: 20, production: 0 },
      { flag: '账单异步导出 V3', dev: 5, staging: 0, production: 0 },
      { flag: '商品智能推荐位', dev: 100, staging: 50, production: 35 },
      { flag: '实时用户特征服务', dev: 100, staging: 80, production: 60 },
    ],
    adoptionTrend: [
      { date: '09-23', flags: 18, rollbacks: 1 },
      { date: '09-24', flags: 21, rollbacks: 0 },
      { date: '09-25', flags: 19, rollbacks: 2 },
      { date: '09-26', flags: 24, rollbacks: 1 },
      { date: '09-27', flags: 27, rollbacks: 0 },
      { date: '09-28', flags: 31, rollbacks: 3 },
      { date: '09-29', flags: 29, rollbacks: 1 },
    ],
  }
}
