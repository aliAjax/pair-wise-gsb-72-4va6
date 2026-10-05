import { useEffect, useMemo, useState } from 'react'
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
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import {
  useAdvanceEnvironmentMutation,
  useFreezeEnvironmentMutation,
  useGetFlagsQuery,
  useGetSnapshotsQuery,
  useRollbackFlagMutation,
} from '@/services/flagApi'
import { EnvironmentStateChip, PlanStatusChip } from '@/components/PlanStatusChip'
import { SnapshotDetails } from '@/components/SnapshotDetails'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import type { Environment, EnvironmentRuntime, ReleaseSnapshot } from '@/types'

const ENVIRONMENTS: Environment[] = ['dev', 'staging', 'production']
const environmentLabel: Record<Environment, string> = {
  dev: '开发 DEV',
  staging: '预发 STG',
  production: '生产 PROD',
}

export function RolloutPage() {
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const [selectedId, setSelectedId] = useState('')
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [advanceEnv, advanceState] = useAdvanceEnvironmentMutation()
  const [freezeEnv, freezeState] = useFreezeEnvironmentMutation()
  const [doRollback, rollbackState] = useRollbackFlagMutation()

  useEffect(() => {
    if (!selectedId && flags.length > 0) setSelectedId(flags[0].id)
  }, [flags, selectedId])

  const flag = flags.find((item) => item.id === selectedId)
  const { data: snapshots = [] } = useGetSnapshotsQuery(flag?.id, { skip: !flag })

  const flagNameLookup = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of flags) map.set(item.id, item.name)
    return (id: string) => map.get(id)
  }, [flags])

  const snapshotById = (id: string): ReleaseSnapshot | undefined =>
    snapshots.find((snapshot) => snapshot.id === id)

  const latestSnapshot = useMemo(
    () => (flag?.plan ? snapshotById(flag.plan.latestSnapshotId) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flag, snapshots],
  )

  const boundSnapshot = (runtime: EnvironmentRuntime) =>
    runtime.snapshotId ? snapshotById(runtime.snapshotId) : latestSnapshot

  const submitAdvance = async (environment: Environment) => {
    if (!flag) return
    try {
      await advanceEnv({ id: flag.id, environment, actor: '林默' }).unwrap()
      setMessage(`${environmentLabel[environment]} 已按审批快照推进到下一阶段`)
    } catch (error) {
      const detail = error && typeof error === 'object' && 'data' in error
        ? ((error as { data?: { message?: string } }).data?.message ?? '推进失败')
        : '推进失败'
      setMessage(detail)
    }
  }

  const submitFreeze = async (environment: Environment, frozen: boolean) => {
    if (!flag) return
    try {
      await freezeEnv({ id: flag.id, environment, actor: '林默', frozen }).unwrap()
      setMessage(`${environmentLabel[environment]} ${frozen ? '已冻结' : '已解冻'}`)
    } catch (error) {
      const detail = error && typeof error === 'object' && 'data' in error
        ? ((error as { data?: { message?: string } }).data?.message ?? '操作失败')
        : '操作失败'
      setMessage(detail)
    }
  }

  const submitRollback = async () => {
    if (!flag || reason.trim().length < 8) {
      setMessage('回滚原因至少 8 个字符')
      return
    }
    try {
      await doRollback({ id: flag.id, actor: '林默', reason }).unwrap()
      setRollbackOpen(false)
      setReason('')
      setMessage('已按快照回滚，依赖该开关的发布计划已按环境标记断链并停止下一阶段')
    } catch {
      setMessage('回滚失败，请重试')
    }
  }

  const busy = advanceState.isLoading || freezeState.isLoading

  const messageSeverity = (text: string): 'error' | 'warning' | 'success' => {
    if (text.includes('失败') || text.includes('不能') || text.includes('阻止') || text.includes('已拒绝')) return 'error'
    if (text.includes('断链') || text.includes('失效')) return 'warning'
    return 'success'
  }

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">灰度发布时间线</Typography>
          <Typography color="text.secondary">
            审批生成不可变快照，各环境按各自快照运行；配置更新只影响未推进环境，依赖回滚立即断链。
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

      {message && (
        <Alert severity={messageSeverity(message)} onClose={() => setMessage('')} sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}
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
                    {flag.plan && <PlanStatusChip status={flag.plan.status} />}
                    <Chip size="small" variant="outlined" label={`配置版本 rev.${flag.configRevision}`} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {flag.key} · 当前生产口径 {flag.rolloutPercentage}%
                  </Typography>
                </Box>
                <Button color="error" variant="outlined" startIcon={<UndoOutlinedIcon />} onClick={() => setRollbackOpen(true)}>
                  紧急回滚
                </Button>
              </Stack>
              {flag.plan?.status === 'invalidated' && (
                <Alert severity="error" sx={{ mt: 2 }}
                  action={<Button href={`/flags/${flag.id}`} size="small" color="inherit">去修改并重审</Button>}
                >
                  审批后配置发生变更，未推进环境的计划已失效（{flag.plan.invalidatedReason}）；已推进环境仍按各自快照继续。
                </Alert>
              )}
            </CardContent>
          </Card>

          <Box className="rollout-grid" sx={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'start' }}>
            {ENVIRONMENTS.map((environment) => {
              const runtime = flag.plan?.environments.find((item) => item.environment === environment)
              const snapshot = runtime ? boundSnapshot(runtime) : undefined
              if (!runtime || !snapshot) {
                return (
                  <Card key={environment}>
                    <CardContent>
                      <Typography variant="h3" sx={{ mb: 1 }}>{environmentLabel[environment]}</Typography>
                      <Alert severity="warning">
                        {flag.plan?.status === 'invalidated'
                          ? '计划已失效，重新审批后才能推进该环境。'
                          : '尚未审批，没有可运行的发布快照。'}
                      </Alert>
                    </CardContent>
                  </Card>
                )
              }
              const steps = snapshot.payload.rolloutSteps
              const isLast = runtime.stepIndex >= steps.length - 1
              return (
                <Card key={environment}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                      <Typography variant="h3">{environmentLabel[environment]}</Typography>
                      <EnvironmentStateChip state={runtime.state} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      运行快照 v{snapshot.version} · {runtime.percentage}% · {runtime.updatedAt.slice(5, 16).replace('T', ' ')}
                    </Typography>

                    {runtime.brokenChains.length > 0 && (
                      <Alert icon={<LinkOffIcon fontSize="inherit" />} severity="error" sx={{ mt: 1.2, py: 0.5 }}>
                        {runtime.brokenChains.map((chain) => (
                          <Typography key={chain.dependencyFlagId} variant="caption" display="block">
                            断链：{chain.dependencyFlagKey} 已回滚，下一阶段已停止
                          </Typography>
                        ))}
                      </Alert>
                    )}

                    <Box sx={{ mt: 1.5, overflowX: 'auto' }}>
                      <Stepper activeStep={Math.max(runtime.stepIndex, 0)} alternativeLabel>
                        {steps.map((step, index) => (
                          <Step key={step.id} completed={index < runtime.stepIndex || runtime.state === 'completed'}>
                            <StepLabel
                              error={runtime.state === 'blocked' && index === runtime.stepIndex + 1}
                              optional={<Typography variant="caption">{step.audience}</Typography>}
                            >
                              {step.percentage}%
                            </StepLabel>
                          </Step>
                        ))}
                      </Stepper>
                    </Box>

                    <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PlayArrowOutlinedIcon />}
                        disabled={
                          busy ||
                          runtime.state === 'blocked' ||
                          runtime.state === 'rolled-back' ||
                          runtime.state === 'completed' ||
                          (runtime.state === 'active' && isLast) ||
                          runtime.paused ||
                          (runtime.state === 'awaiting' && flag.plan?.status === 'invalidated')
                        }
                        onClick={() => void submitAdvance(environment)}
                      >
                        {runtime.state === 'awaiting' ? '按快照启动' : '推进下一阶段'}
                      </Button>
                      {runtime.state === 'active' && (
                        runtime.paused ? (
                          <Button size="small" startIcon={<PlayCircleOutlineIcon />} disabled={busy} onClick={() => void submitFreeze(environment, false)}>
                            解冻
                          </Button>
                        ) : (
                          <Button size="small" color="warning" variant="outlined" startIcon={<PauseCircleOutlineIcon />} disabled={busy} onClick={() => void submitFreeze(environment, true)}>
                            冻结
                          </Button>
                        )
                      )}
                    </Stack>
                    {runtime.paused && runtime.state === 'active' && (
                      <Typography variant="caption" color="warning.main">已冻结：停留在当前阶段，不会扩大流量</Typography>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </Box>

          <Box className="rollout-grid" sx={{ alignItems: 'start' }}>
            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5 }}>
                  当前审批快照{latestSnapshot ? ` v${latestSnapshot.version}` : ''}
                </Typography>
                {latestSnapshot ? (
                  <SnapshotDetails snapshot={latestSnapshot} flagLookup={flagNameLookup} />
                ) : (
                  <Alert severity="info">尚未审批生成快照。审批通过后将固化受众规则、依赖条件与回滚阈值。</Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h3" sx={{ mb: 1.5 }}>历史快照（不可变）</Typography>
                {snapshots.length === 0 && <Typography variant="body2" color="text.secondary">暂无快照记录。</Typography>}
                <Stack spacing={1.2}>
                  {snapshots.map((snapshot) => (
                    <Box key={snapshot.id} className="guardrail-row" sx={{ alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="body2" fontWeight={700}>
                          v{snapshot.version}
                          {flag.plan?.latestSnapshotId === snapshot.id && <Chip size="small" color="success" label="最新" sx={{ ml: 1 }} />}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {snapshot.createdAt.slice(0, 16).replace('T', ' ')} · {snapshot.approvedBy} · rev.{snapshot.configRevision}
                        </Typography>
                        <Typography variant="caption" display="block">
                          规则 {snapshot.payload.audienceRules.length} · 依赖 {snapshot.payload.dependencies.length} · 阈值 {snapshot.payload.rollbackThresholds.length}
                        </Typography>
                      </Box>
                      <Stack spacing={0.5} alignItems="flex-end">
                        {ENVIRONMENTS.map((environment) => {
                          const runtime = flag.plan?.environments.find((item) => item.environment === environment)
                          const bound = runtime?.snapshotId === snapshot.id
                          return bound ? <Chip key={environment} size="small" variant="outlined" label={`${environment} 运行中`} /> : null
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </>
      )}

      <Dialog open={rollbackOpen} onClose={() => setRollbackOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>确认紧急回滚</DialogTitle>
        <DialogContent dividers>
          <Alert severity="error" sx={{ mb: 2 }}>
            各已推进环境立即按绑定快照回到关闭状态；前置依赖本开关的发布计划会按环境标记断链并停止下一阶段。
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
