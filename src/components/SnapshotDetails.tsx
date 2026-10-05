import {
  Box,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import type { ReleaseSnapshot } from '@/types'
import { formatRule } from '@/services/snapshots'

const dependencyLabel: Record<string, string> = {
  requires: '前置依赖',
  conflicts: '互斥冲突',
  fallback: '降级路径',
}

/** 不可变快照内容：受众规则、依赖条件、回滚阈值（只读） */
export function SnapshotDetails({
  snapshot,
  compact = false,
  flagLookup,
}: {
  snapshot: ReleaseSnapshot
  compact?: boolean
  flagLookup?: (id: string) => string | undefined
}) {
  const payload = snapshot.payload
  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
        <LockOutlinedIcon fontSize="small" color="warning" />
        <Typography variant="body2" fontWeight={800}>
          快照 v{snapshot.version}
        </Typography>
        <Chip size="small" variant="outlined" label={snapshot.id} sx={{ fontFamily: 'monospace' }} />
        <Chip size="small" color="success" variant="outlined" label={`校验 ${snapshot.checksum}`} sx={{ fontFamily: 'monospace' }} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {snapshot.createdAt.slice(0, 16).replace('T', ' ')} · {snapshot.approvedBy} 审批固化 · 配置版本 rev.{snapshot.configRevision}
      </Typography>
      {!compact && (
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
          审批意见：{snapshot.approvalComment}
        </Typography>
      )}

      <Divider sx={{ my: 1.2 }} />

      <Typography variant="caption" fontWeight={800}>受众规则（{payload.audienceRules.length}）</Typography>
      <List dense disablePadding>
        {payload.audienceRules.length === 0 && (
          <ListItem disableGutters><ListItemText primary={<Typography variant="caption">无规则限制，面向全部用户</Typography>} /></ListItem>
        )}
        {payload.audienceRules.map((rule) => (
          <ListItem key={rule.id} disableGutters sx={{ py: 0.2 }}>
            <ListItemText
              primary={<Typography variant="caption" fontFamily="monospace">{formatRule(rule)}</Typography>}
            />
          </ListItem>
        ))}
      </List>

      <Typography variant="caption" fontWeight={800} sx={{ mt: 0.5, display: 'block' }}>
        依赖条件（{payload.dependencies.length}）
      </Typography>
      <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        {payload.dependencies.length === 0 && <Typography variant="caption">无外部依赖</Typography>}
        {payload.dependencies.map((dependency, index) => (
          <Chip
            key={`${dependency.flagId}-${index}`}
            size="small"
            variant="outlined"
            color={dependency.type === 'requires' ? 'primary' : dependency.type === 'conflicts' ? 'error' : 'default'}
            label={`${dependencyLabel[dependency.type]} · ${flagLookup?.(dependency.flagId) ?? dependency.flagId}：${dependency.condition}`}
          />
        ))}
      </Stack>

      <Typography variant="caption" fontWeight={800} sx={{ mt: 1, display: 'block' }}>
        回滚阈值（{payload.rollbackThresholds.length}）
      </Typography>
      <List dense disablePadding>
        {payload.rollbackThresholds.map((threshold, index) => (
          <ListItem key={`${threshold}-${index}`} disableGutters sx={{ py: 0.2 }}>
            <ListItemText primary={<Typography variant="caption">• {threshold}</Typography>} />
          </ListItem>
        ))}
      </List>
    </Box>
  )
}
