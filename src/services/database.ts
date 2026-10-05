import type {
  AuditEvent,
  DashboardData,
  Environment,
  EnvironmentState,
  FeatureFlag,
  ImpactIssue,
  ReleaseSnapshot,
  ReviewPayload,
} from '@/types'
import {
  createSnapshot,
  isEnvironmentAdvanced,
  isSnapshotIntact,
  markBrokenChain,
  newPlan,
  planHasPendingEnvironments,
} from '@/services/snapshots'

const STORAGE_KEY = 'feature-flag-release-console-v1'

export interface Database {
  flags: FeatureFlag[]
  audit: AuditEvent[]
  issues: ImpactIssue[]
  snapshots: ReleaseSnapshot[]
}

/** 保存失败注入：置为 true 时下一次写入会抛错，用于验证“不留半套计划” */
export let failNextWrite = false
export const setFailNextWrite = (value: boolean) => {
  failNextWrite = value
}

const baseFlags: FeatureFlag[] = [
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
    configRevision: 3,
    plan: null,
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
      { id: 's-203', percentage: 50, audience: '全量活跃用户', startedAt: '2026-10-06T10:00:00+08:00', status: 'planned', guardrails: ['人工审批'] },
      { id: 's-204', percentage: 100, audience: '全部用户', startedAt: '2026-10-10T10:00:00+08:00', status: 'planned', guardrails: ['人工审批'] },
    ],
    createdAt: '2026-08-28T09:30:00+08:00',
    updatedAt: '2026-09-28T16:40:00+08:00',
    lastChangedBy: '周启',
    configRevision: 4,
    plan: null,
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
    configRevision: 2,
    plan: null,
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
    configRevision: 6,
    plan: null,
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
    configRevision: 3,
    plan: null,
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
    configRevision: 2,
    plan: null,
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
    configRevision: 2,
    plan: null,
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
    configRevision: 5,
    plan: null,
  },
]

/** 已审批开关的初始计划运行态（快照在 seedDatabase 时按当前配置固化生成） */
const seedPlanOverrides: Record<
  string,
  Array<[Environment, EnvironmentState, number, number]>
> = {
  'flag-102': [
    ['dev', 'completed', 3, 100],
    ['staging', 'active', 1, 35],
    ['production', 'awaiting', -1, 0],
  ],
  'flag-104': [
    ['dev', 'completed', 0, 100],
    ['staging', 'completed', 0, 100],
    ['production', 'completed', 0, 100],
  ],
  'flag-105': [
    ['dev', 'completed', 0, 100],
    ['staging', 'active', 0, 60],
    ['production', 'active', 0, 60],
  ],
  'flag-107': [
    ['dev', 'completed', 0, 100],
    ['staging', 'completed', 0, 100],
    ['production', 'awaiting', -1, 0],
  ],
  'flag-108': [
    ['dev', 'completed', 0, 100],
    ['staging', 'active', 0, 12],
    ['production', 'active', 0, 12],
  ],
  'flag-106': [
    ['dev', 'completed', 0, 100],
    ['staging', 'rolled-back', 0, 0],
    ['production', 'rolled-back', 0, 0],
  ],
}

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

const APPROVED_FLAG_IDS = Object.keys(seedPlanOverrides)

/** 为已发布开关构建首批不可变快照与计划（示例数据同样遵守快照机制） */
function seedSnapshotsAndPlans(flags: FeatureFlag[]): {
  snapshots: ReleaseSnapshot[]
} {
  const snapshots: ReleaseSnapshot[] = []
  for (const flag of flags) {
    if (!APPROVED_FLAG_IDS.includes(flag.id)) continue
    const snapshot = createSnapshot(flag, 1, {
      approvedBy: flag.lastChangedBy,
      comment: '初始发布审批：受众规则、依赖条件与回滚阈值已固化。',
      createdAt: flag.updatedAt,
    })
    snapshots.push(snapshot)
    const plan = newPlan(snapshot.id, flag.updatedAt)
    const overrides = seedPlanOverrides[flag.id]
    plan.environments = plan.environments.map((runtime) => {
      const match = overrides.find(([environment]) => environment === runtime.environment)
      if (!match) return runtime
      const [, state, stepIndex, percentage] = match
      const advanced = state !== 'awaiting'
      return {
        ...runtime,
        state,
        snapshotId: advanced ? snapshot.id : '',
        stepIndex,
        percentage,
        paused: state === 'active' && (flag.status === 'frozen'),
        advancedAt: advanced ? flag.updatedAt : '',
      }
    })
    if (plan.environments.every((runtime) => runtime.state === 'completed')) plan.status = 'completed'
    flag.plan = plan
  }
  return { snapshots }
}

export const seedDatabase = (): Database => {
  // 深拷贝，避免示例数组在多次 seed 间共享计划对象
  const flags: FeatureFlag[] = JSON.parse(JSON.stringify(baseFlags))
  const { snapshots } = seedSnapshotsAndPlans(flags)
  return { flags, audit: JSON.parse(JSON.stringify(audit)), issues: JSON.parse(JSON.stringify(issues)), snapshots }
}

/** 原子写入：单次 setItem 成功才生效；注入失败或浏览器抛错时旧数据保持完整 */
export const writeDatabase = (database: Database): void => {
  if (failNextWrite) {
    failNextWrite = false
    throw new Error('快照存储不可用，写入已拒绝')
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(database))
}

const isPlainFlag = (value: unknown): value is FeatureFlag => {
  const candidate = value as FeatureFlag
  return Boolean(candidate && typeof candidate.id === 'string' && Array.isArray(candidate.rolloutSteps))
}

/** 旧版本数据迁移：补齐配置版本号与快照表 */
const migrateDatabase = (raw: Partial<Database>): Database => {
  const database: Database = {
    flags: Array.isArray(raw.flags) ? raw.flags : [],
    audit: Array.isArray(raw.audit) ? raw.audit : [],
    issues: Array.isArray(raw.issues) ? raw.issues : [],
    snapshots: Array.isArray(raw.snapshots) ? raw.snapshots : [],
  }
  for (const flag of database.flags) {
    if (typeof flag.configRevision !== 'number') flag.configRevision = 1
    if (flag.plan === undefined) flag.plan = null
  }
  return database
}

/**
 * 启动自愈：
 * 1. 校验每份快照 checksum，损坏的快照不参与运行；
 * 2. 环境绑定快照缺失/损坏时，回退到该开关最近一份完整快照；
 * 3. 无法回退的计划标记失效，等待重新审批，绝不带着半套计划继续。
 */
function recoverSnapshots(database: Database): AuditEvent[] {
  const recoveryEvents: AuditEvent[] = []
  const intact = new Map<string, ReleaseSnapshot>()
  const damaged = new Set<string>()

  for (const snapshot of database.snapshots) {
    if (isSnapshotIntact(snapshot)) intact.set(snapshot.id, snapshot)
    else damaged.add(snapshot.id)
  }

  const latestIntactByFlag = new Map<string, ReleaseSnapshot>()
  for (const snapshot of intact.values()) {
    const current = latestIntactByFlag.get(snapshot.flagId)
    if (!current || snapshot.version > current.version) latestIntactByFlag.set(snapshot.flagId, snapshot)
  }

  for (const flag of database.flags) {
    if (!flag.plan) continue
    const plan = flag.plan

    for (const runtime of plan.environments) {
      if (!runtime.snapshotId || intact.has(runtime.snapshotId)) continue
      const fallback = latestIntactByFlag.get(flag.id)
      if (fallback) {
        const reason = damaged.has(runtime.snapshotId) ? '快照校验失败' : '快照记录缺失'
        runtime.snapshotId = fallback.id
        runtime.brokenChains = runtime.brokenChains.filter((chain) => chain.reason !== reason)
        if (runtime.state === 'blocked') {
          runtime.state = runtime.percentage === 0 ? 'awaiting' : 'active'
          runtime.paused = false
        }
        recoveryEvents.push({
          id: `audit-recover-${flag.id}-${runtime.environment}-${Date.now()}`,
          flagId: flag.id,
          flagKey: flag.key,
          action: 'snapshot-created',
          actor: '系统自愈',
          summary: `${runtime.environment} 环境${reason}，已从上一个完整快照 v${fallback.version} 继续运行。`,
          after: fallback.id,
          affectedUsers: 0,
          createdAt: new Date().toISOString(),
          snapshotId: fallback.id,
          environments: [runtime.environment],
        })
      } else {
        runtime.state = 'awaiting'
        runtime.snapshotId = ''
        runtime.stepIndex = -1
        runtime.percentage = 0
        runtime.paused = false
        plan.status = 'invalidated'
        plan.invalidatedAt = new Date().toISOString()
        plan.invalidatedReason = '绑定快照损坏且无完整快照可回退，计划失效重审'
      }
    }

    if (plan.latestSnapshotId && !intact.has(plan.latestSnapshotId)) {
      const fallback = latestIntactByFlag.get(flag.id)
      if (fallback) plan.latestSnapshotId = fallback.id
      else {
        plan.status = 'invalidated'
        plan.invalidatedAt = new Date().toISOString()
        plan.invalidatedReason = '最新快照损坏且无完整快照可回退'
      }
    }
  }

  // 损坏快照保留记录但移出有效集合，报告中可追溯
  database.snapshots = database.snapshots.filter((snapshot) => intact.has(snapshot.id))
  return recoveryEvents
}

export const readDatabase = (): Database => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
  let parsed: Partial<Database>
  try {
    parsed = JSON.parse(raw) as Partial<Database>
  } catch {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
  if (!parsed || !Array.isArray(parsed.flags) || !parsed.flags.every(isPlainFlag)) {
    const seed = seedDatabase()
    writeDatabase(seed)
    return seed
  }
  const database = migrateDatabase(parsed)
  const recoveryEvents = recoverSnapshots(database)
  if (recoveryEvents.length > 0) {
    database.audit.unshift(...recoveryEvents)
    writeDatabase(database)
  }
  return database
}

/** 受快照保护的配置字段：这些字段变化意味着审批版本与当前配置不一致 */
const SNAPSHOTED_FIELDS: Array<keyof FeatureFlag> = [
  'audienceRules',
  'regions',
  'minClientVersion',
  'dependencies',
  'rollbackConditions',
  'metricNames',
  'rolloutSteps',
]

const configChanged = (before: FeatureFlag, after: FeatureFlag): boolean =>
  SNAPSHOTED_FIELDS.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))

/**
 * 审批后配置更新：已推进环境继续按各自快照运行，未推进环境的计划失效重审。
 * 返回是否发生了失效以及失效时仍受保护的环境列表。
 */
export function applyConfigUpdate(db: Database, before: FeatureFlag, next: FeatureFlag): { invalidated: boolean; protectedEnvironments: Environment[] } {
  next.configRevision = before.configRevision + 1
  const plan = before.plan
  if (!plan || plan.status === 'invalidated' || !configChanged(before, next)) {
    return { invalidated: false, protectedEnvironments: [] }
  }

  const advanced = plan.environments.filter(isEnvironmentAdvanced)
  const protectedEnvironments = advanced.map((runtime) => runtime.environment)

  // 全部环境都已推进：没有需要重审的对象，仅留下新配置版本，运行态不受影响
  if (!planHasPendingEnvironments(plan)) {
    return { invalidated: false, protectedEnvironments }
  }

  plan.status = 'invalidated'
  plan.invalidatedAt = new Date().toISOString()
  plan.invalidatedReason = '审批后受众规则、依赖条件或回滚阈值发生变更，未推进环境需重新审批'
  for (const runtime of plan.environments) {
    if (!isEnvironmentAdvanced(runtime)) {
      runtime.snapshotId = ''
      runtime.stepIndex = -1
      runtime.percentage = 0
      runtime.state = 'awaiting'
    }
  }
  next.status = 'review'
  db.audit.unshift({
    id: `audit-${Date.now()}`,
    flagId: next.id,
    flagKey: next.key,
    action: 'plan-invalidated',
    actor: next.lastChangedBy,
    summary: `配置已更新，未推进环境的发布计划失效，需重新审批；${protectedEnvironments.length} 个已推进环境继续按原快照运行。`,
    before: `rev.${before.configRevision}`,
    after: `rev.${next.configRevision}`,
    affectedUsers: 0,
    createdAt: new Date().toISOString(),
    environments: protectedEnvironments,
  })

  return { invalidated: true, protectedEnvironments }
}

export const applyReview = (flagId: string, payload: ReviewPayload): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const beforeStatus = flag.status
  const timestamp = new Date().toISOString()

  if (payload.decision === 'rejected') {
    flag.status = 'draft'
    flag.updatedAt = timestamp
    flag.lastChangedBy = payload.reviewer
    db.audit.unshift({
      id: `audit-${Date.now()}`,
      flagId,
      flagKey: flag.key,
      action: 'rejected',
      actor: payload.reviewer,
      summary: payload.comment,
      before: beforeStatus,
      after: 'draft',
      affectedUsers: 0,
      createdAt: timestamp,
    })
    writeDatabase(db)
    return flag
  }

  if (payload.freezeUntil) {
    flag.rollbackConditions = [...flag.rollbackConditions, `冻结至 ${payload.freezeUntil}，期间禁止扩大流量`]
  }

  // 批准：生成不可变快照（含受众规则、依赖条件、回滚阈值；冻结策略一并固化）
  const version = db.snapshots.reduce((max, snapshot) => (snapshot.flagId === flagId ? Math.max(max, snapshot.version) : max), 0) + 1
  const snapshot = createSnapshot(flag, version, {
    approvedBy: payload.reviewer,
    comment: payload.comment,
    freezeUntil: payload.freezeUntil,
    createdAt: timestamp,
  })

  // 重新审批时保留已推进环境（按各自旧快照继续运行），未推进环境绑定新快照
  const carriedEnvironments =
    flag.plan?.environments.filter(
      (runtime) => isEnvironmentAdvanced(runtime) && runtime.state !== 'rolled-back',
    ) ?? []

  const plan = newPlan(snapshot.id, timestamp)
  plan.environments = plan.environments.map((runtime) => {
    const carried = carriedEnvironments.find((item) => item.environment === runtime.environment)
    if (!carried) return { ...runtime, updatedAt: timestamp }
    // 新审批版本解除历史断链，已推进环境恢复运行（仍按旧快照）
    return {
      ...carried,
      state: carried.percentage >= 100 ? 'completed' : 'active',
      paused: false,
      brokenChains: [],
      updatedAt: timestamp,
    }
  })
  if (plan.environments.every((runtime) => runtime.state === 'completed')) plan.status = 'completed'

  flag.status = 'active'
  flag.enabled = true
  flag.plan = plan
  flag.updatedAt = timestamp
  flag.lastChangedBy = payload.reviewer

  db.snapshots.push(snapshot)
  db.audit.unshift({
    id: `audit-${Date.now()}-approve`,
    flagId,
    flagKey: flag.key,
    action: 'approved',
    actor: payload.reviewer,
    summary: `已生成不可变发布快照 v${version}：固化受众规则 ${snapshot.payload.audienceRules.length} 条、依赖条件 ${snapshot.payload.dependencies.length} 项、回滚阈值 ${snapshot.payload.rollbackThresholds.length} 条。${payload.comment}`,
    before: beforeStatus,
    after: 'active',
    affectedUsers: Math.round(120000 * (flag.rolloutPercentage / 100)),
    createdAt: timestamp,
    snapshotId: snapshot.id,
    environments: carriedEnvironments.map((runtime) => runtime.environment),
  })

  try {
    // 单次原子写入：快照、计划与审批事件一起落盘，失败则整笔不生效
    writeDatabase(db)
  } catch (error) {
    throw new Error(`发布快照保存失败，已拒绝留下半套计划：${error instanceof Error ? error.message : '未知错误'}`)
  }
  return flag
}

/** 推进环境：按环境绑定的不可变快照进入下一阶段 */
export const advanceEnvironment = (
  flagId: string,
  environment: Environment,
  actor: string,
): { flag: FeatureFlag; snapshot: ReleaseSnapshot; stepIndex: number; percentage: number } => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const plan = flag.plan
  if (!plan || plan.status === 'invalidated') throw new Error('发布计划已失效，请重新审批后再推进')
  const runtime = plan.environments.find((item) => item.environment === environment)
  if (!runtime) throw new Error('环境不存在')
  if (runtime.state === 'blocked') throw new Error('依赖开关已回滚导致断链，需先解除阻断')
  if (runtime.state === 'rolled-back') throw new Error('该环境已回滚，不能继续推进')

  const snapshot = db.snapshots.find((item) => item.id === (runtime.snapshotId || plan.latestSnapshotId))
  if (!snapshot || !isSnapshotIntact(snapshot)) {
    throw new Error('发布快照缺失或校验失败，已阻止推进，请从上一个完整快照恢复')
  }

  const steps = snapshot.payload.rolloutSteps
  const nextIndex = runtime.stepIndex + 1
  if (nextIndex >= steps.length) throw new Error('该环境已是最终阶段')
  const nextStep = steps[nextIndex]
  const timestamp = new Date().toISOString()

  runtime.state = nextIndex === steps.length - 1 && nextStep.percentage >= 100 ? 'completed' : 'active'
  runtime.snapshotId = snapshot.id
  runtime.stepIndex = nextIndex
  runtime.percentage = nextStep.percentage
  runtime.paused = false
  runtime.advancedAt = runtime.advancedAt || timestamp
  runtime.updatedAt = timestamp

  if (environment === 'production') {
    flag.enabled = true
    flag.rolloutPercentage = nextStep.percentage
  }

  db.audit.unshift({
    id: `audit-${Date.now()}`,
    flagId,
    flagKey: flag.key,
    action: 'rollout-adjusted',
    actor,
    summary: `${environment} 环境按快照 v${snapshot.version} 推进至 ${nextStep.percentage}%（${nextStep.audience}）。`,
    before: `${runtime.stepIndex === 0 ? 0 : steps[nextIndex - 1]?.percentage ?? 0}%`,
    after: `${nextStep.percentage}%`,
    affectedUsers: Math.round(900000 * (nextStep.percentage / 100)),
    createdAt: timestamp,
    snapshotId: snapshot.id,
    environments: [environment],
  })

  if (plan.environments.every((item) => item.state === 'completed' || item.state === 'rolled-back') &&
      plan.environments.some((item) => item.state === 'completed')) {
    plan.status = 'completed'
  }

  writeDatabase(db)
  return { flag, snapshot, stepIndex: nextIndex, percentage: nextStep.percentage }
}

/** 按环境冻结/解冻（不改变快照绑定） */
export const freezeEnvironment = (
  flagId: string,
  environment: Environment,
  actor: string,
  frozen: boolean,
): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const runtime = flag.plan?.environments.find((item) => item.environment === environment)
  if (!runtime) throw new Error('该环境尚未绑定发布计划')
  runtime.paused = frozen
  runtime.updatedAt = new Date().toISOString()
  if (environment === 'production') flag.status = frozen ? 'frozen' : 'active'
  db.audit.unshift({
    id: `audit-${Date.now()}`,
    flagId,
    flagKey: flag.key,
    action: frozen ? 'frozen' : 'unfrozen',
    actor,
    summary: `${environment} 环境${frozen ? '已冻结，停止下一阶段' : '已解冻，可继续按快照推进'}。`,
    before: frozen ? 'active' : 'frozen',
    after: frozen ? 'frozen' : 'active',
    affectedUsers: Math.round(900000 * (runtime.percentage / 100)),
    createdAt: new Date().toISOString(),
    snapshotId: runtime.snapshotId,
    environments: [environment],
  })
  writeDatabase(db)
  return flag
}

/**
 * 回滚开关：开关本身置为已回滚；所有“前置依赖（requires）它”的发布计划，
 * 在各自已推进的环境上标记断链并停止下一阶段。
 */
export const rollbackFlag = (flagId: string, actor: string, reason: string): FeatureFlag => {
  const db = readDatabase()
  const flag = db.flags.find((item) => item.id === flagId)
  if (!flag) throw new Error('功能开关不存在')
  const timestamp = new Date().toISOString()
  const before = `${flag.status} / ${flag.rolloutPercentage}%`
  const previousPercentage = flag.rolloutPercentage
  const previousAffectedUsers = Math.round(980000 * (previousPercentage / 100))

  const affectedEnvironments: Environment[] = []
  if (flag.plan) {
    for (const runtime of flag.plan.environments) {
      if (!isEnvironmentAdvanced(runtime)) continue
      runtime.state = 'rolled-back'
      runtime.paused = true
      runtime.percentage = 0
      runtime.updatedAt = timestamp
      affectedEnvironments.push(runtime.environment)
    }
  }

  flag.status = 'rolled-back'
  flag.enabled = false
  flag.rolloutPercentage = 0
  flag.updatedAt = timestamp
  flag.lastChangedBy = actor

  db.audit.unshift({
    id: `audit-${Date.now()}-rollback`,
    flagId,
    flagKey: flag.key,
    action: 'rolled-back',
    actor,
    summary: `${reason} 已按快照回滚，受影响环境：${affectedEnvironments.join('、') || '无已推进环境'}。`,
    before,
    after: 'rolled-back / 0%',
    affectedUsers: previousAffectedUsers,
    createdAt: timestamp,
    environments: affectedEnvironments,
  })

  // 依赖断链级联：requires 该开关的计划，按环境停止下一阶段
  const dependents = db.flags.filter((candidate) =>
    candidate.dependencies.some((dependency) => dependency.flagId === flagId && dependency.type === 'requires'),
  )
  for (const dependent of dependents) {
    if (!dependent.plan || dependent.plan.status === 'invalidated') continue
    const brokenEnvironments: Environment[] = []
    for (const runtime of dependent.plan.environments) {
      if (!isEnvironmentAdvanced(runtime) || runtime.state === 'rolled-back') continue
      const chain = {
        dependencyFlagId: flagId,
        dependencyFlagKey: flag.key,
        reason: `前置依赖 ${flag.key} 已回滚：${reason}`,
        brokenAt: timestamp,
      }
      const beforeLength = runtime.brokenChains.length
      const updated = markBrokenChain(runtime, chain)
      Object.assign(runtime, updated)
      if (runtime.brokenChains.length > beforeLength) brokenEnvironments.push(runtime.environment)
    }
    if (brokenEnvironments.length > 0) {
      db.audit.unshift({
        id: `audit-${Date.now()}-chain-${dependent.id}`,
        flagId: dependent.id,
        flagKey: dependent.key,
        action: 'chain-broken',
        actor,
        summary: `依赖开关 ${flag.key} 回滚，${brokenEnvironments.join('、')} 环境出现断链，已停止下一阶段，等待重新审批。`,
        before: 'active',
        after: 'blocked',
        affectedUsers: 0,
        createdAt: timestamp,
        environments: brokenEnvironments,
      })
    }
  }

  writeDatabase(db)
  return flag
}

export const getDashboardStats = (): DashboardData => {
  const db = readDatabase()
  const envPercentage = (flag: FeatureFlag, environment: Environment): number => {
    const runtime = flag.plan?.environments.find((item) => item.environment === environment)
    if (!runtime || !isEnvironmentAdvanced(runtime)) return 0
    return runtime.state === 'rolled-back' ? 0 : runtime.percentage
  }
  const brokenChains = db.flags.reduce(
    (sum, flag) =>
      sum +
      (flag.plan?.environments.reduce(
        (inner, runtime) => inner + runtime.brokenChains.length,
        0,
      ) ?? 0),
    0,
  )
  const invalidatedPending = db.flags.filter((flag) => flag.plan?.status === 'invalidated').length
  return {
    activeFlags: db.flags.filter((flag) => flag.enabled).length,
    pendingReview: db.flags.filter((flag) => flag.status === 'review').length + invalidatedPending,
    blockerIssues: db.issues.filter((issue) => issue.severity === 'blocker' && !issue.resolved).length,
    brokenChains,
    affectedUsers: 5246900,
    environmentDiff: db.flags
      .filter((flag) => flag.plan)
      .slice(0, 4)
      .map((flag) => ({
        flag: flag.name,
        dev: envPercentage(flag, 'dev'),
        staging: envPercentage(flag, 'staging'),
        production: envPercentage(flag, 'production'),
      })),
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
