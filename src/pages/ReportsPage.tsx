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
import { useGetAuditQuery, useGetDashboardQuery, useGetFlagsQuery, useGetIssuesQuery, useGetSnapshotsQuery } from '@/services/flagApi'
import { EnvironmentStateChip, PlanStatusChip } from '@/components/PlanStatusChip'
import { FlagStatusChip } from '@/components/FlagStatusChip'

const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`

const envLabel: Record<string, string> = { dev: 'DEV', staging: 'STG', production: 'PROD' }

export function ReportsPage() {
  const [environment, setEnvironment] = useState('')
  const [message, setMessage] = useState('')
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const { data: dashboard } = useGetDashboardQuery()
  const { data: issues = [] } = useGetIssuesQuery({})
  const { data: audit = [] } = useGetAuditQuery({})
  const { data: snapshots = [] } = useGetSnapshotsQuery(undefined)

  const reportFlags = useMemo(
    () => flags.filter((flag) => !environment || flag.environment === environment),
    [environment, flags],
  )

  const brokenChainFlags = reportFlags.filter((flag) =>
    flag.plan?.environments.some((runtime) => runtime.brokenChains.length > 0),
  )

  const exportReport = () => {
    const rows = [
      ['开关Key', '名称', '环境', '状态', '计划状态', '生产放量', '运行快照版本', '受众规则', '依赖条件', '回滚阈值', '断链环境', '配置版本', '预计影响用户'],
      ...reportFlags.map((flag) => {
        const prod = flag.plan?.environments.find((item) => item.environment === 'production')
        const versions = [
          ...new Set(
            (flag.plan?.environments ?? [])
              .map((runtime) => snapshots.find((snapshot) => snapshot.id === runtime.snapshotId)?.version)
              .filter((version): version is number => typeof version === 'number'),
          ),
        ]
        const brokenEnvs = (flag.plan?.environments ?? [])
          .filter((runtime) => runtime.brokenChains.length > 0)
          .map((runtime) => envLabel[runtime.environment] ?? runtime.environment)
        const latest = flag.plan ? snapshots.find((snapshot) => snapshot.id === flag.plan?.latestSnapshotId) : undefined
        return [
          flag.key,
          flag.name,
          flag.environment,
          flag.status,
          flag.plan?.status ?? 'unapproved',
          `${prod?.percentage ?? 0}%`,
          versions.length > 0 ? versions.join('|') : latest ? `v${latest.version}(待推进)` : '-',
          latest?.payload.audienceRules.length ?? 0,
          latest?.payload.dependencies.length ?? flag.dependencies.length,
          (latest?.payload.rollbackThresholds ?? flag.rollbackConditions).join('|'),
          brokenEnvs.join('|'),
          flag.configRevision,
          Math.round(980000 * ((prod?.percentage ?? 0) / 100)),
        ]
      }),
    ]
    const csv = `﻿${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `feature-flag-release-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setMessage('发布报告已按各环境运行快照导出')
  }

  const riskFlags = reportFlags.filter((flag) => {
    const flagIssues = issues.filter((issue) => issue.flagId === flag.id && !issue.resolved)
    return flagIssues.some((issue) => issue.severity === 'blocker')
  })

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">发布报告</Typography>
          <Typography color="text.secondary">
            报告口径以审批快照为准：已推进环境按各自绑定快照统计，回滚与断链按环境标注，避免“报告与生产实际运行版本对不上”。
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
            <Typography className="summary-value">{reportFlags.length} 个开关</Typography>
          </Box>
        </Box>
        <Box><Typography variant="caption">发布快照</Typography><Typography className="summary-value">{snapshots.length}</Typography></Box>
        <Box><Typography variant="caption">断链计划</Typography><Typography className={`summary-value${brokenChainFlags.length > 0 ? ' danger' : ''}`}>{brokenChainFlags.length}</Typography></Box>
        <Box><Typography variant="caption">审计事件</Typography><Typography className="summary-value">{audit.length}</Typography></Box>
        <Box><Typography variant="caption">未解决阻断项</Typography><Typography className={`summary-value${riskFlags.length > 0 ? ' danger' : ''}`}>{riskFlags.length}</Typography></Box>
        <Box><Typography variant="caption">影响用户</Typography><Typography className="summary-value">{(dashboard?.affectedUsers ?? 0).toLocaleString()}</Typography></Box>
      </Box>

      {brokenChainFlags.length > 0 && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {brokenChainFlags.map((flag) =>
            (flag.plan?.environments ?? [])
              .filter((runtime) => runtime.brokenChains.length > 0)
              .map((runtime) => `${flag.name}@${envLabel[runtime.environment]}`)
              .join('、'),
          ).join('；')}
          {' '}存在依赖断链，已停止下一阶段。
        </Alert>
      )}

      <Box className="report-grid">
        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 2 }}>环境采用率（按运行快照）</Typography>
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
          <Typography variant="h3" sx={{ mb: 1.5 }}>发布快照与环境运行明细</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>功能开关</TableCell>
                  <TableCell>计划 / 开关状态</TableCell>
                  <TableCell>各环境运行（快照 v / 放量）</TableCell>
                  <TableCell>快照内容</TableCell>
                  <TableCell>最后变更</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reportFlags.map((flag) => {
                  const latest = flag.plan
                    ? snapshots.find((snapshot) => snapshot.id === flag.plan?.latestSnapshotId)
                    : undefined
                  const versionOf = (snapshotId: string) => snapshots.find((snapshot) => snapshot.id === snapshotId)?.version
                  return (
                    <TableRow key={flag.id} hover selected={flag.plan?.status === 'invalidated'}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={700}>{flag.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{flag.key} · rev.{flag.configRevision}</Typography>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} alignItems="flex-start">
                          {flag.plan ? <PlanStatusChip status={flag.plan.status} /> : <Chip size="small" variant="outlined" label="未审批" />}
                          <FlagStatusChip status={flag.status} />
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Stack spacing={0.5} alignItems="flex-start">
                          {(flag.plan?.environments ?? []).map((runtime) => (
                            <Stack key={runtime.environment} direction="row" spacing={0.7} alignItems="center">
                              <Typography variant="caption" sx={{ width: 34 }}>{envLabel[runtime.environment]}</Typography>
                              <EnvironmentStateChip state={runtime.state} />
                              <Typography variant="caption">
                                {runtime.snapshotId ? `v${versionOf(runtime.snapshotId) ?? '?'} · ${runtime.percentage}%` : '未绑定快照'}
                              </Typography>
                              {runtime.brokenChains.length > 0 && <Chip size="small" color="error" label="断链" />}
                            </Stack>
                          ))}
                          {!flag.plan && <Typography variant="caption" color="text.secondary">审批后生成快照</Typography>}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {latest ? (
                          <Typography variant="caption">
                            规则 {latest.payload.audienceRules.length} · 依赖 {latest.payload.dependencies.length} · 阈值 {latest.payload.rollbackThresholds.length}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            规则 {flag.audienceRules.length} · 依赖 {flag.dependencies.length} · 回滚条件 {flag.rollbackConditions.length}（待固化）
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{flag.lastChangedBy}</Typography>
                        <Typography variant="caption" color="text.secondary">{flag.updatedAt.slice(0, 16).replace('T', ' ')}</Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  )
}
