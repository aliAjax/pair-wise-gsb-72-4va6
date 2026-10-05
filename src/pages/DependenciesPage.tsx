import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
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
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined'
import { Link } from 'react-router-dom'
import { useGetFlagsQuery, useGetReleasePlansQuery } from '@/services/flagApi'
import { environmentLabel } from '@/services/database'
import { DependencyGraph } from '@/components/DependencyGraph'
import { FlagStatusChip } from '@/components/FlagStatusChip'

export function DependenciesPage() {
  const { data: flags = [], isLoading } = useGetFlagsQuery({})
  const { data: plans = [] } = useGetReleasePlansQuery()
  const [selectedId, setSelectedId] = useState('')

  useEffect(() => {
    if (!selectedId && flags.length > 0) setSelectedId(flags[0].id)
  }, [flags, selectedId])

  const selectedFlag = flags.find((flag) => flag.id === selectedId)
  const conflicts = flags.flatMap((flag) =>
    flag.dependencies
      .filter((dependency) => dependency.type === 'conflicts')
      .map((dependency) => ({ source: flag, target: flags.find((item) => item.id === dependency.flagId), dependency })),
  )
  const activeConflicts = conflicts.filter((item) => item.source.enabled && item.target?.enabled)
  const brokenLinks = plans.flatMap((plan) =>
    plan.environments.flatMap((env) =>
      env.brokenLinks.map((link) => ({ plan, env, link })),
    ),
  )

  return (
    <Box>
      <Box className="page-heading">
        <Box>
          <Typography variant="h2">依赖与冲突分析</Typography>
          <Typography color="text.secondary">
            检查前置依赖、互斥关系和降级路径，避免开关组合导致运行态冲突。
          </Typography>
        </Box>
        <TextField
          select
          label="分析目标"
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          sx={{ width: 300 }}
        >
          {flags.map((flag) => <MenuItem key={flag.id} value={flag.id}>{flag.name}</MenuItem>)}
        </TextField>
      </Box>

      {activeConflicts.length > 0 ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          检测到 {activeConflicts.length} 组已启用互斥开关，发布前必须先关闭冲突项或调整受众。
        </Alert>
      ) : (
        <Alert severity="success" sx={{ mb: 2 }}>
          当前已启用开关之间没有直接互斥冲突。
        </Alert>
      )}

      {brokenLinks.length > 0 && (
        <Alert severity="error" icon={<LinkOffOutlinedIcon />} sx={{ mb: 2 }}>
          {brokenLinks.length} 处依赖断链：依赖开关已回滚，受影响的发布计划已按环境停止下一阶段。
        </Alert>
      )}

      <Box className="dependency-layout">
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h3">影响关系图</Typography>
                <Typography variant="caption" color="text.secondary">实线表示前置依赖，红色表示互斥</Typography>
              </Box>
              {selectedFlag && (
                <Button component={Link} to={`/flags/${selectedFlag.id}`} startIcon={<EditOutlinedIcon />} size="small">
                  编辑依赖
                </Button>
              )}
            </Stack>
            {selectedFlag ? <DependencyGraph selectedFlag={selectedFlag} allFlags={flags} /> : <Typography>暂无数据</Typography>}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h3" sx={{ mb: 1 }}>分析摘要</Typography>
            <Box className="dependency-summary">
              <Box><AccountTreeOutlinedIcon color="primary" /><Typography variant="caption">直接依赖</Typography><Typography className="summary-value">{selectedFlag?.dependencies.length ?? 0}</Typography></Box>
              <Box><AccountTreeOutlinedIcon color="error" /><Typography variant="caption">互斥关系</Typography><Typography className="summary-value">{selectedFlag?.dependencies.filter((item) => item.type === 'conflicts').length ?? 0}</Typography></Box>
              <Box><AccountTreeOutlinedIcon color="warning" /><Typography variant="caption">死代码候选</Typography><Typography className="summary-value">{flags.filter((flag) => flag.deadCodeStatus !== 'clean').length}</Typography></Box>
            </Box>
          </CardContent>
        </Card>
      </Box>

      <Card>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 1.5 }}>全量冲突矩阵</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>源开关</TableCell>
                  <TableCell>关系</TableCell>
                  <TableCell>目标开关</TableCell>
                  <TableCell>条件</TableCell>
                  <TableCell>当前组合</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conflicts.map(({ source, target, dependency }) => (
                  <TableRow key={`${source.id}-${target?.id}`}>
                    <TableCell>
                      <Typography component={Link} to={`/flags/${source.id}`} variant="body2" fontWeight={700}>{source.name}</Typography>
                      <FlagStatusChip status={source.status} />
                    </TableCell>
                    <TableCell><Chip size="small" color="error" label="互斥" /></TableCell>
                    <TableCell>
                      <Typography component={Link} to={`/flags/${target?.id}`} variant="body2" fontWeight={700}>{target?.name}</Typography>
                      {target && <FlagStatusChip status={target.status} />}
                    </TableCell>
                    <TableCell>{dependency.condition}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={source.enabled && target?.enabled ? 'error' : 'success'}
                        label={source.enabled && target?.enabled ? '冲突已生效' : '未同时启用'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && conflicts.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}>未配置冲突关系</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Typography variant="h3" sx={{ mb: 1.5 }}>依赖断链追踪</Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>受影响发布计划</TableCell>
                  <TableCell>环境</TableCell>
                  <TableCell>断链依赖</TableCell>
                  <TableCell>原因</TableCell>
                  <TableCell>检测时间</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {brokenLinks.map(({ plan, env, link }) => (
                  <TableRow key={`${plan.id}-${env.environment}-${link.dependencyFlagId}`} hover>
                    <TableCell>
                      <Typography component={Link} to={`/flags/${plan.flagId}`} variant="body2" fontWeight={700}>
                        {plan.flagKey}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" variant="outlined" label={environmentLabel[env.environment]} />
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color="error" icon={<LinkOffOutlinedIcon />} label={`${link.dependencyName} 已回滚`} />
                    </TableCell>
                    <TableCell>{link.reason}</TableCell>
                    <TableCell>{link.detectedAt.slice(0, 16).replace('T', ' ')}</TableCell>
                  </TableRow>
                ))}
                {brokenLinks.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 5 }}>当前没有依赖断链</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  )
}
