import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined'
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined'
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined'
import { useGetDashboardQuery, useGetFlagsQuery, useGetIssuesQuery, useGetReleasePlansQuery, useGetSnapshotsQuery } from '@/services/flagApi'
import { environmentLabel } from '@/services/database'
import { FlagStatusChip } from '@/components/FlagStatusChip'
import type { Environment, EnvironmentPlan, ReleasePlan, ReleaseSnapshot } from '@/types'

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

const envStatusLabel: Record<EnvironmentPlan['status'], string> = {
  pending: '待推进',
  'in-progress': '进行中',
  completed: '已完成',
  paused: '已暂停',
  invalidated: '已失效',
  halted: '已停止',
}

const currentPercentage = (env: EnvironmentPlan): number => {
  const active = [...env.stages]
    .reverse()
    .find((stage) => stage.status === 'running' || stage.status === 'completed')
  return active?.percentage ?? 0
}

interface ReportRow {
  flagId: string
  flagKey: string
  flagName: string
  owner: string
  team: string
  environment: Environment
  envPlan: EnvironmentPlan | null
  plan: ReleasePlan | null
  snapshot: ReleaseSnapshot | null
}

export function ReportsPage() {
  const [environment, setEnvironment] = useState('')
  const [message, setMessage] = useState('')
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const { data: dashboard } = useGetDashboardQuery()
  const { data: issues = [] } = useGetIssuesQuery({})
  const { data: plans = [] } = useGetReleasePlansQuery()
  const { data: snapshots = [] } = useGetSnapshotsQuery()

  const reportRows = useMemo<ReportRow[]>(() => {
    const rows: ReportRow[] = []
    flags.forEach((flag) => {
      const plan = plans.find((item) => item.flagId === flag.id) ?? null
      const environments = plan?.environments ?? []
      if (environments.length === 0) {
        if (!environment || flag.environment === environment) {
          rows.push({
            flagId: flag.id,
            flagKey: flag.key,
            flagName: flag.name,
            owner: flag.owner,
            team: flag.team,
            environment: flag.environment,
            envPlan: null,
            plan: null,
            snapshot: null,
          })
        }
        return
      }
      environments.forEach((env) => {
        if (environment && env.environment !== environment) return
        rows.push({
          flagId: flag.id,
          flagKey: flag.key,
          flagName: flag.name,
          owner: flag.owner,
          team: flag.team,
          environment: env.environment,
          envPlan: env,
          plan,
          snapshot: snapshots.find((snapshot) => snapshot.id === env.snapshotId) ?? null,
        })
      })
    })
    return rows
  }, [environment, flags, plans, snapshots])

  const exportReport = () => {
    const rows = [
      ['开关Key', '名称', '环境', '计划状态', '运行快照', '快照审批人', '快照审批时间', '当前灰度', '受众规则(快照)', '依赖条件(快照)', '回滚阈值(快照)', '断链依赖', '负责人', '团队'],
      ...reportRows.map((row) => [
        row.flagKey,
        row.flagName,
        environmentLabel[row.environment],
        row.envPlan ? envStatusLabel[row.envPlan.status] : '待审批',
        row.snapshot ? `v${row.snapshot.version}` : '无快照',
        row.snapshot?.approvedBy ?? '-',
        row.snapshot ? row.snapshot.approvedAt.slice(0, 16).replace('T', ' ') : '-',
        row.envPlan ? `${currentPercentage(row.envPlan)}%` : '-',
        row.snapshot
          ? row.snapshot.audienceRules.map((rule) => `${rule.negate ? '排除' : ''}${rule.attribute}${rule.operator}${rule.value}`).join('|') || '全部用户'
          : '-',
        row.snapshot
          ? row.snapshot.dependencies.map((dependency) => `${dependency.type}:${dependency.condition}`).join('|') || '无'
          : '-',
        row.snapshot ? row.snapshot.rollbackConditions.join('|') : '-',
        row.envPlan?.brokenLinks.map((link) => link.dependencyKey).join('|') || '无',
        row.owner,
        row.team,
      ]),
    ]
    const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `feature-flag-release-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('发布报告已导出，内容按各环境实际运行快照生成')
  }

  const riskFlags = flags.filter((flag) => {
    const flagIssues = issues.filter((issue) => issue.flagId === flag.id && !issue.resolved)
    return flagIssues.some((issue) => issue.severity === 'blocker')
  })
  const brokenLinkCount = reportRows.reduce((sum, row) => sum + (row.envPlan?.brokenLinks.length ?? 0), 0)

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">发布报告</Typography>
          <Typography color="text.secondary">
            按各环境实际运行的审批快照汇总配置、灰度与断链情况，导出可归档的发布报告。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <TextField select label="环境范围" value={environment} onChange={(event) => setEnvironment(event.target.value)} sx={{ width: 160 }}>
            <MenuItem value="">全部环境</MenuItem>
            <MenuItem value="dev">开发</MenuItem>
            <MenuItem value="staging">预发</MenuItem>
            <MenuItem value="production">生产</MenuItem>
          </TextField>
          <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={exportReport}>
            导出 CSV
          </Button>
        </Stack>
      </Box>

      {message && <Alert severity="success" onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      {isLoading && <LinearProgress sx={{ mb: 2 }} />}

      <Box className="report-summary">
        <Box className="report-summary-main">
          <AssessmentOutlinedIcon />
          <Box>
            <Typography variant="caption">报告范围</Typography>
            <Typography className="summary-value">{reportRows.length} 条环境记录</Typography>
          </Box>
        </Box>
        <Box><Typography variant="caption">生产已启用</Typography><Typography className="summary-value">{flags.filter((flag) => flag.enabled).length}</Typography></Box>
        <Box><Typography variant="caption">未解决阻断项</Typography><Typography className="summary-value danger">{riskFlags.length}</Typography></Box>
        <Box><Typography variant="caption">断链环境</Typography><Typography className="summary-value danger">{brokenLinkCount}</Typography></Box>
        <Box><Typography variant="caption">影响用户</Typography><Typography className="summary-value">{(dashboard?.affectedUsers ?? 0).toLocaleString()}</Typography></Box>
      </Box>

      <Box className="report-grid">
        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 2 }}>环境采用率</Typography>
            {dashboard?.environmentDiff.map((item) => (
              <Box key={item.flag} className="report-bar-row">
                <Box className="report-bar-copy">
                  <Typography variant="body2" fontWeight={700}>{item.flag}</Typography>
                  <Typography variant="caption" color="text.secondary">DEV {item.dev}% · STG {item.staging}% · PROD {item.production}%</Typography>
                </Box>
                <Box className="report-bar-track"><Box className="report-bar-fill" sx={{ width: `${Math.max(item.production, item.staging / 2)}%` }} /></Box>
              </Box>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 2 }}>影响问题分布</Typography>
            <Box className="issue-distribution">
              {(['blocker', 'warning', 'info'] as const).map((severity) => {
                const count = issues.filter((issue) => issue.severity === severity && !issue.resolved).length
                return (
                  <Box key={severity}>
                    <Chip color={severity === 'blocker' ? 'error' : severity === 'warning' ? 'warning' : 'default'} size="small" label={severity === 'blocker' ? '阻断' : severity === 'warning' ? '警告' : '提示'} />
                    <Typography className="summary-value">{count}</Typography>
                    <Typography variant="caption" color="text.secondary">未解决</Typography>
                  </Box>
                )
              })}
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 1.5 }}>发布明细（按环境运行快照）</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>功能开关</TableCell>
                  <TableCell>环境 / 计划状态</TableCell>
                  <TableCell>运行快照</TableCell>
                  <TableCell>当前灰度</TableCell>
                  <TableCell>快照封存的规则与阈值</TableCell>
                  <TableCell>断链</TableCell>
                  <TableCell>最后变更</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportRows.map((row) => (
                  <TableRow key={`${row.flagId}-${row.environment}`} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight={700}>{row.flagName}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.flagKey}</Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <FlagStatusChip status={flags.find((flag) => flag.id === row.flagId)?.status ?? 'draft'} />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={row.environment.toUpperCase()} />
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        {row.envPlan ? envStatusLabel[row.envPlan.status] : '待审批'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.snapshot ? (
                        <>
                          <Typography variant="body2" fontWeight={700}>v{row.snapshot.version}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.snapshot.approvedBy} · {row.snapshot.approvedAt.slice(0, 16).replace('T', ' ')}
                          </Typography>
                        </>
                      ) : (
                        <Typography variant="body2" color="text.secondary">无快照</Typography>
                      )}
                    </TableCell>
                    <TableCell>{row.envPlan ? `${currentPercentage(row.envPlan)}%` : '-'}</TableCell>
                    <TableCell>
                      {row.snapshot ? (
                        <Typography variant="body2">
                          {row.snapshot.audienceRules.length} 条规则 · {row.snapshot.dependencies.length} 项依赖 · {row.snapshot.rollbackConditions.length} 条回滚阈值
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.envPlan && row.envPlan.brokenLinks.length > 0 ? (
                        <Chip
                          size="small"
                          color="error"
                          icon={<LinkOffOutlinedIcon />}
                          label={row.envPlan.brokenLinks.map((link) => link.dependencyKey).join('、')}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">无</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.owner}</Typography>
                      <Typography variant="caption" color="text.secondary">{row.team}</Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  )
}
