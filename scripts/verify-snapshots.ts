/**
 * 发布快照机制端到端逻辑验证（不依赖浏览器）：
 *   node_modules/esbuild/bin/esbuild scripts/verify-snapshots.ts --bundle --platform=node --format=esm --alias:@=./src | node --input-type=module
 */
import assert from 'node:assert/strict'

// ---- 浏览器 API 桩 ----
const storage = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return storage.size
  },
  clear: () => storage.clear(),
  getItem: (key: string) => storage.get(key) ?? null,
  key: (index: number) => [...storage.keys()][index] ?? null,
  removeItem: (key: string) => void storage.delete(key),
  setItem: (key: string, value: string) => void storage.set(key, value),
}

const {
  seedDatabase,
  readDatabase,
  writeDatabase,
  applyReview,
  advanceEnvironment,
  rollbackFlag,
  setFailNextWrite,
  applyConfigUpdate,
} = await import('@/services/database')

let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

const findFlag = (id: string) => readDatabase().flags.find((flag) => flag.id === id)!
const payload = {
  reviewer: '林默',
  decision: 'approved' as const,
  comment: '规则、依赖、指标与回滚阈值均已核对无误。',
}

console.log('1) 初始数据：已发布开关拥有完整快照与按环境运行态')
check('flag-102 已有计划且三个环境运行态正确', () => {
  const db = seedDatabase()
  writeDatabase(db)
  const flag = findFlag('flag-102')
  assert.ok(flag.plan, '应有计划')
  assert.equal(flag.plan.status, 'active')
  const [dev, staging, production] = flag.plan.environments
  assert.equal(dev.state, 'completed')
  assert.equal(dev.percentage, 100)
  assert.equal(staging.state, 'active')
  assert.equal(staging.percentage, 35)
  assert.equal(production.state, 'awaiting')
  assert.equal(production.snapshotId, '')
  // 已推进环境绑定快照
  assert.equal(dev.snapshotId, flag.plan.latestSnapshotId)
})

check('快照固化了受众规则/依赖/回滚阈值且 checksum 可校验', () => {
  const db = readDatabase()
  const flag = findFlag('flag-102')
  const snapshot = db.snapshots.find((item) => item.id === flag.plan!.latestSnapshotId)!
  assert.equal(snapshot.payload.audienceRules.length, 2)
  assert.equal(snapshot.payload.dependencies.length, 1)
  assert.equal(snapshot.payload.rollbackThresholds.length, 2)
  assert.match(snapshot.checksum, /^[0-9a-f]{8}$/)
})

console.log('2) 审批生成不可变快照')
check('flag-101 审批后生成快照与计划，开关启用', () => {
  const flag = applyReview('flag-101', payload)
  assert.equal(flag.status, 'active')
  assert.equal(flag.enabled, true)
  assert.ok(flag.plan)
  const db = readDatabase()
  const versions = db.snapshots.filter((item) => item.flagId === 'flag-101')
  assert.equal(versions.length, 1)
  assert.equal(versions[0].version, 1)
})

console.log('3) 各环境按各自快照推进')
check('dev 推进到第 1 阶段后绑定快照', () => {
  const result = advanceEnvironment('flag-101', 'dev', '林默')
  assert.equal(result.stepIndex, 0)
  assert.equal(result.percentage, 1)
  const runtime = findFlag('flag-101').plan!.environments[0]
  assert.equal(runtime.state, 'active')
  assert.equal(runtime.snapshotId, result.snapshot.id)
})
check('staging/production 未推进时仍为 awaiting', () => {
  const plan = findFlag('flag-101').plan!
  assert.equal(plan.environments[1].state, 'awaiting')
  assert.equal(plan.environments[2].state, 'awaiting')
})

console.log('4) 审批后配置更新：未推进失效重审，已推进按旧快照运行')
check('修改受众规则使未推进环境失效，dev 不受影响', () => {
  const db = readDatabase()
  const before = db.flags.find((flag) => flag.id === 'flag-101')!
  const oldSnapshotId = before.plan!.environments[0].snapshotId
  const next = {
    ...before,
    audienceRules: [
      ...before.audienceRules,
      { id: 'r-new', attribute: 'user.tier', operator: 'equals' as const, value: 'vip', negate: false },
    ],
    lastChangedBy: '陈思远',
  }
  const result = applyConfigUpdate(db, before, next)
  assert.equal(result.invalidated, true)
  assert.deepEqual(result.protectedEnvironments, ['dev'])
  db.flags[db.flags.findIndex((flag) => flag.id === 'flag-101')] = next
  writeDatabase(db)

  const updated = findFlag('flag-101')
  assert.equal(updated.plan!.status, 'invalidated')
  assert.equal(updated.status, 'review')
  assert.equal(updated.configRevision, before.configRevision + 1)
  const dev = updated.plan!.environments[0]
  assert.equal(dev.state, 'active')
  assert.equal(dev.snapshotId, oldSnapshotId, '已推进环境继续绑定旧快照')
  const staging = updated.plan!.environments[1]
  assert.equal(staging.state, 'awaiting')
  assert.equal(staging.snapshotId, '')
})

check('失效计划不能推进，必须重新审批', () => {
  assert.throws(
    () => advanceEnvironment('flag-101', 'staging', '林默'),
    /已失效/,
  )
})

check('重新审批生成 v2 快照，dev 按 v1 保留、未推进环境用 v2', () => {
  const flag = applyReview('flag-101', { ...payload, comment: '新增 vip 受众，重新审批通过。' })
  const db = readDatabase()
  const snapshots = db.snapshots.filter((item) => item.flagId === 'flag-101')
  assert.equal(snapshots.length, 2)
  assert.equal(flag.plan!.latestSnapshotId, snapshots[1].id)
  const dev = flag.plan!.environments[0]
  assert.equal(dev.snapshotId, snapshots[0].id, 'dev 仍按 v1')
  assert.equal(flag.plan!.environments[1].state, 'awaiting')
})

check('staging 启动时绑定最新 v2 快照', () => {
  const result = advanceEnvironment('flag-101', 'staging', '林默')
  assert.equal(result.snapshot.version, 2)
})

console.log('5) 依赖开关回滚：使用方按环境断链并停止下一阶段')
check('回滚 flag-104（支付聚合路由）使 flag-101 各已推进环境断链', () => {
  rollbackFlag('flag-104', '林默', '收单渠道连续失败 20 次，触发回滚阈值。')
  const flag = findFlag('flag-101')
  const [dev, staging, production] = flag.plan!.environments
  assert.equal(dev.state, 'blocked')
  assert.equal(staging.state, 'blocked')
  assert.equal(production.state, 'awaiting', '未推进环境不产生断链')
  assert.equal(dev.brokenChains[0].dependencyFlagId, 'flag-104')
  assert.equal(staging.brokenChains.length, 1)
})
check('断链环境推进被拒绝', () => {
  assert.throws(() => advanceEnvironment('flag-101', 'dev', '林默'), /断链/)
})
check('审计中记录 chain-broken 事件且带环境标注', () => {
  const db = readDatabase()
  const event = db.audit.find((item) => item.action === 'chain-broken' && item.flagId === 'flag-101')!
  assert.ok(event)
  assert.deepEqual([...(event.environments ?? [])].sort(), ['dev', 'staging'])
})

console.log('6) 保存快照失败不留半套计划')
check('审批写入失败时数据库无快照、无新计划、开关状态不变', () => {
  // 先把 flag-103 的阻断指标补齐以通过审批流程前置（审批本身不查问题，直接批准）
  const before = readDatabase()
  const flag103 = before.flags.find((flag) => flag.id === 'flag-103')!
  const statusBefore = flag103.status
  const snapshotCountBefore = before.snapshots.length
  const planBefore = flag103.plan

  setFailNextWrite(true)
  assert.throws(() => applyReview('flag-103', payload), /半套计划/)

  const after = readDatabase()
  const after103 = after.flags.find((flag) => flag.id === 'flag-103')!
  assert.equal(after.snapshots.length, snapshotCountBefore, '快照未写入')
  assert.equal(after103.status, statusBefore, '开关状态保持')
  assert.equal(after103.plan, planBefore, '计划保持')
})

console.log('7) 重开（重新读取）从上一个完整快照恢复')
check('破坏某环境绑定的旧快照后，读取时自动回退到完整快照', () => {
  const db = readDatabase()
  // flag-101 的 dev 绑定 v1；破坏 v1 的 checksum
  const v1 = db.snapshots.find((item) => item.flagId === 'flag-101' && item.version === 1)!
  v1.payload.rollbackThresholds.push('被外部破坏')
  writeDatabase(db)

  const recovered = readDatabase()
  const flag = recovered.flags.find((item) => item.id === 'flag-101')!
  const dev = flag.plan!.environments[0]
  const v2 = recovered.snapshots.find((item) => item.flagId === 'flag-101' && item.version === 2)!
  assert.equal(dev.snapshotId, v2.id, '回退到最近完整快照 v2')
  assert.notEqual(dev.state, 'blocked', '断链随回退解除（仍需关注）')
  const recoveryEvent = recovered.audit.find((item) => item.actor === '系统自愈')
  assert.ok(recoveryEvent, '应有自愈审计')
  assert.equal(recovered.snapshots.some((item) => item.id === v1.id), false, '损坏快照被移出有效集合')
})

check('所有快照损坏且无回退时计划标记失效，不带半套计划继续', () => {
  const db = readDatabase()
  // flag-104 只有一份 v1 快照且全环境已推进
  const snap = db.snapshots.find((item) => item.flagId === 'flag-104')!
  snap.payload.audienceRules.push({ id: 'x', attribute: 'x', operator: 'equals', value: 'x', negate: false })
  writeDatabase(db)

  const recovered = readDatabase()
  const flag = recovered.flags.find((item) => item.id === 'flag-104')!
  assert.equal(flag.plan!.status, 'invalidated')
})

console.log(`\n全部 ${passed} 项检查通过 ✅`)
