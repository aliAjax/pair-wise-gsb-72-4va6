import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined'
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline'
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined'
import {
  useAdvanceEnvironmentMutation,
  useFreezeRolloutMutation,
  useGetFlagsQuery,
  useGetReleasePlanQuery,
  useGetSnapshotsQuery,
  useRollbackFlagMutation,
} from '@/services/flagApi'
import { environmentLabel } from '@/services/database'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import type { Dependency, Environment, EnvironmentPlanStatus, ReleaseSnapshot } from '@/types'

const envStatusMeta: Record<EnvironmentPlanStatus, { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' }> = {
  pending: { label: '待推进', color: 'default' },
  'in-progress': { label: '进行中', color: 'primary' },
  completed: { label: '已完成', color: 'success' },
  paused: { label: '已暂停', color: 'warning' },
  invalidated: { label: '已失效待重审', color: 'error' },
  halted: { label: '已停止', color: 'error' },
}

const stageStatusLabel = {
  completed: '已完成',
  running: '进行中',
  planned: '计划中',
  paused: '已暂停',
} as const

const dependencyTypeLabel: Record<Dependency['type'], string> = {
  requires: '前置依赖',
  conflicts: '互斥冲突',
  fallback: '降级路径',
}

const errorMessage = (error: unknown, fallback: string) =>
  typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: unknown }).message)
    : fallback

export function RolloutPage() {
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const [selectedId, setSelectedId] = useState('')
  const [snapshotEnv, setSnapshotEnv] = useState<Environment>('production')
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<'success' | 'error' | 'info'>('success')

  useEffect(() => {
    if (!selectedId && flags.length > 0) setSelectedId(flags[0].id)
  }, [flags, selectedId])

  const flag = flags.find((item) => item.id === selectedId)
  const { data: plan } = useGetReleasePlanQuery(selectedId, { skip: !selectedId })
  const { data: snapshots = [] } = useGetSnapshotsQuery(selectedId, { skip: !selectedId })
  const [advanceEnvironment, advanceState] = useAdvanceEnvironmentMutation()
  const [freezeRollout, freezeState] = useFreezeRolloutMutation()
  const [rollbackFlag, rollbackState] = useRollbackFlagMutation()

  useEffect(() => {
    const current = flags.find((item) => item.id === selectedId)
    if (current) setSnapshotEnv(current.environment)
    // 仅在切换发布目标时同步默认环境，避免刷新重置用户选择
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const notify = (text: string, tone: 'success' | 'error' | 'info' = 'success') => {
    setMessage(text)
    setSeverity(tone)
  }

  const snapshotOf = (snapshotId: string) => snapshots.find((item) => item.id === snapshotId)

  const advance = async (environment: Environment) => {
    if (!flag) return
    try {
      await advanceEnvironment({ flagId: flag.id, environment, actor: '林默' }).unwrap()
      notify(`${environmentLabel[environment]}环境已按各自快照推进一阶段，新的回滚边界已保存`)
    } catch (error) {
      notify(errorMessage(error, '推进失败，请检查配置后重试'), 'error')
    }
  }

  const freeze = async () => {
    if (!flag) return
    try {
      await freezeRollout({ id: flag.id, actor: '林默' }).unwrap()
      notify('灰度流量已冻结，各环境运行中阶段已暂停')
    } catch (error) {
      notify(errorMessage(error, '冻结失败，请重试'), 'error')
    }
  }

  const submitRollback = async () => {
    if (!flag || reason.trim().length < 8) {
      notify('回滚原因至少 8 个字符', 'error')
      return
    }
    try {
      const result = await rollbackFlag({ id: flag.id, actor: '林默', reason }).unwrap()
      setRollbackOpen(false)
      setReason('')
      notify(
        result.impactedPlans.length > 0
          ? `已完成回滚；${result.impactedPlans.length} 个依赖它的发布计划（${result.impactedPlans.join('、')}）已按环境标出断链并停止下一阶段`
          : '已完成回滚，开关关闭并写入审计日志',
      )
    } catch (error) {
      notify(errorMessage(error, '回滚失败，请重试'), 'error')
    }
  }

  const invalidatedEnvironments = plan?.environments.filter((env) => env.status === 'invalidated') ?? []
  const snapshotEnvPlan = plan?.environments.find((env) => env.environment === snapshotEnv)
  const snapshotEnvSnapshot = snapshotEnvPlan ? snapshotOf(snapshotEnvPlan.snapshotId) : undefined

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">灰度发布时间线</Typography>
          <Typography color="text.secondary">
            每个环境按各自审批快照推进放量，配置变更不会污染已推进环境。
          </Typography>
        </Box>
        <TextField
          select
          label="发布目标"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          sx={{ width: 300 }}
        >
          {flags.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
        </TextField>
      </Box>

      {message && <Alert severity={severity} onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      {flag && (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="h3">{flag.name}</Typography>
                    <FlagStatusChip status={flag.status} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {flag.key} · 当前 {flag.rolloutPercentage}%
                    {snapshots.length > 0 && ` · 最新快照 v${snapshots[0].version}（${snapshots[0].approvedBy} 批准）`}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" startIcon={<PauseCircleOutlineIcon />} onClick={() => void freeze()} disabled={freezeState.isLoading || flag.status === 'frozen'}>
                    冻结流量
                  </Button>
                  <Button color="error" variant="outlined" startIcon={<UndoOutlinedIcon />} onClick={() => setRollbackOpen(true)}>
                    紧急回滚
                  </Button>
                </Stack>
              </Stack>
              {invalidatedEnvironments.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  审批后配置已变更，{invalidatedEnvironments.map((env) => environmentLabel[env.environment]).join('、')}
                  环境的发布计划已失效，需重新评审；已推进环境仍按原快照运行。
                </Alert>
              )}
              {!plan && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  该开关尚未生成审批快照，通过影响评审后才会创建分环境发布计划。
                </Alert>
              )}
            </CardContent>
          </Card>

          {plan && (
            <Box className="environment-plan-grid">
              {plan.environments.map((env) => {
                const snapshot = snapshotOf(env.snapshotId)
                const nextStage = env.stages.find((stage) => stage.status === 'planned')
                const runningStage = env.stages.find((stage) => stage.status === 'running')
                const blocked =
                  env.status === 'invalidated' ||
                  env.status === 'halted' ||
                  env.status === 'paused' ||
                  env.status === 'completed' ||
                  env.brokenLinks.length > 0 ||
                  (!nextStage && !runningStage)
                const activeStep = Math.max(
                  env.stages.findIndex((stage) => stage.status === 'running'),
                  env.stages.filter((stage) => stage.status === 'completed').length - 1,
                  0,
                )
                const advanceLabel = () => {
                  if (env.status === 'completed') return '全部阶段已完成'
                  if (env.status === 'invalidated') return '已失效，需重新评审'
                  if (env.status === 'halted') return '已因回滚停止'
                  if (env.status === 'paused') return '已冻结暂停'
                  if (env.brokenLinks.length > 0) return '断链未处理，已停止推进'
                  if (nextStage) return `推进至 ${nextStage.percentage}%`
                  if (runningStage) return '完成当前阶段'
                  return '暂无可推进阶段'
                }
                return (
                  <Card key={env.environment}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                        <Box>
                          <Typography variant="h3">{environmentLabel[env.environment]}环境</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {snapshot ? `运行快照 v${snapshot.version} · ${snapshot.approvedBy} 批准` : '快照缺失'}
                          </Typography>
                        </Box>
                        <Chip size="small" color={envStatusMeta[env.status].color} variant="outlined" label={envStatusMeta[env.status].label} />
                      </Stack>

                      {env.brokenLinks.length > 0 && (
                        <Alert severity="error" icon={<LinkOffOutlinedIcon />} sx={{ mb: 1.5 }}>
                          {env.brokenLinks.map((link) => (
                            <Typography key={link.dependencyFlagId} variant="body2">
                              断链：{link.dependencyName}（{link.dependencyKey}）已回滚，下一阶段已停止。
                            </Typography>
                          ))}
                        </Alert>
                      )}
                      {env.status === 'invalidated' && (
                        <Alert severity="warning" sx={{ mb: 1.5 }}>
                          配置在审批后变更，本环境计划已失效，重新评审前不可推进。
                        </Alert>
                      )}

                      <Stepper activeStep={activeStep} orientation="vertical">
                        {env.stages.map((stage) => (
                          <Step key={stage.id} completed={stage.status === 'completed'}>
                            <StepLabel
                              optional={
                                <Typography variant="caption" color={stage.status === 'paused' ? 'warning.main' : 'text.secondary'}>
                                  {stage.audience}
                                  {stage.guardrails.length > 0 && ` · 守护：${stage.guardrails.join('、')}`}
                                </Typography>
                              }
                            >
                              {stage.percentage}% · {stageStatusLabel[stage.status]}
                            </StepLabel>
                          </Step>
                        ))}
                      </Stepper>

                      <Button
                        fullWidth
                        variant="contained"
                        startIcon={<PlayArrowOutlinedIcon />}
                        disabled={blocked || advanceState.isLoading}
                        onClick={() => void advance(env.environment)}
                        sx={{ mt: 1 }}
                      >
                        {advanceLabel()}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </Box>
          )}

          {plan && (
            <Card>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Box>
                    <Typography variant="h3">环境运行快照内容</Typography>
                    <Typography variant="caption" color="text.secondary">
                      快照不可变：受众规则、依赖条件与回滚阈值以审批时封存为准
                    </Typography>
                  </Box>
                  <TextField
                    select
                    label="查看环境"
                    value={snapshotEnv}
                    onChange={(event) => setSnapshotEnv(event.target.value as Environment)}
                    sx={{ width: 160 }}
                  >
                    {plan.environments.map((env) => (
                      <MenuItem key={env.environment} value={env.environment}>
                        {environmentLabel[env.environment]}环境
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
                {snapshotEnvSnapshot ? (
                  <SnapshotDetail snapshot={snapshotEnvSnapshot} flags={flags.map((item) => ({ id: item.id, name: item.name }))} />
                ) : (
                  <Alert severity="info">该环境尚未绑定快照。</Alert>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={rollbackOpen} onClose={() => setRollbackOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认紧急回滚</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            回滚会立即关闭开关、停止自身发布计划；依赖它的发布计划将按环境标出断链并停止下一阶段。
          </Alert>
          <TextField
            label="回滚原因与异常证据"
            multiline
            minRows={3}
            fullWidth
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackOpen(false)}>取消</Button>
          <Button color="error" variant="contained" loading={rollbackState.isLoading} onClick={() => void submitRollback()}>
            执行回滚
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function SnapshotDetail({ snapshot, flags }: { snapshot: ReleaseSnapshot; flags: Array<{ id: string; name: string }> }) {
  return (
    <Box className="snapshot-detail">
      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>受众规则（{snapshot.audienceRules.length} 条）</Typography>
        {snapshot.audienceRules.map((rule) => (
          <Typography key={rule.id} variant="body2" sx={{ mb: 0.5 }}>
            • {rule.negate ? '排除 ' : ''}{rule.attribute} {rule.operator} {rule.value}
          </Typography>
        ))}
        {snapshot.audienceRules.length === 0 && <Typography variant="body2" color="text.secondary">面向全部用户</Typography>}
      </Box>
      <Divider orientation="vertical" flexItem />
      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>依赖条件（{snapshot.dependencies.length} 项）</Typography>
        {snapshot.dependencies.map((dependency, index) => (
          <Typography key={`${dependency.flagId}-${index}`} variant="body2" sx={{ mb: 0.5 }}>
            • [{dependencyTypeLabel[dependency.type]}] {flags.find((flag) => flag.id === dependency.flagId)?.name ?? dependency.flagId}：{dependency.condition}
          </Typography>
        ))}
        {snapshot.dependencies.length === 0 && <Typography variant="body2" color="text.secondary">无依赖</Typography>}
      </Box>
      <Divider orientation="vertical" flexItem />
      <Box>
        <Typography variant="h3" sx={{ mb: 1 }}>回滚阈值（{snapshot.rollbackConditions.length} 条）</Typography>
        {snapshot.rollbackConditions.map((condition) => (
          <Typography key={condition} variant="body2" sx={{ mb: 0.5 }}>• {condition}</Typography>
        ))}
        {snapshot.rollbackConditions.length === 0 && <Typography variant="body2" color="text.secondary">未配置</Typography>}
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
          快照 v{snapshot.version} · {snapshot.approvedBy} · {snapshot.approvedAt.slice(0, 16).replace('T', ' ')} · 校验 {snapshot.checksum}
        </Typography>
      </Box>
    </Box>
  )
}
