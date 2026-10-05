import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import {
  advanceEnvironment,
  applyConfigUpdate,
  applyReview,
  freezeEnvironment,
  getDashboardStats,
  readDatabase,
  rollbackFlag,
  writeDatabase,
} from '@/services/database'
import type {
  AuditEvent,
  DashboardData,
  Environment,
  FeatureFlag,
  FlagFilter,
  ImpactIssue,
  ReleaseSnapshot,
  ReviewPayload,
} from '@/types'

const delay = (milliseconds = 180) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

export const flagApi = createApi({
  reducerPath: 'flagApi',
  baseQuery: fakeBaseQuery<{ message: string }>(),
  tagTypes: ['Flags', 'Flag', 'Issues', 'Audit', 'Dashboard', 'Snapshots'],
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardData, void>({
      async queryFn() {
        await delay()
        return { data: getDashboardStats() }
      },
      providesTags: ['Dashboard'],
    }),
    getFlags: builder.query<FeatureFlag[], FlagFilter>({
      async queryFn(filters) {
        await delay()
        const keyword = filters.keyword?.trim().toLowerCase()
        const data = readDatabase().flags.filter(
          (flag) =>
            (!filters.status || flag.status === filters.status) &&
            (!filters.environment || flag.environment === filters.environment) &&
            (!filters.team || flag.team === filters.team) &&
            (!filters.owner || flag.owner === filters.owner) &&
            (!keyword ||
              flag.name.toLowerCase().includes(keyword) ||
              flag.key.toLowerCase().includes(keyword) ||
              flag.owner.toLowerCase().includes(keyword)),
        )
        return { data }
      },
      providesTags: ['Flags'],
    }),
    getFlag: builder.query<FeatureFlag, string>({
      async queryFn(id) {
        await delay()
        const flag = readDatabase().flags.find((item) => item.id === id)
        return flag ? { data: flag } : { error: { message: '功能开关不存在' } }
      },
      providesTags: (_result, _error, id) => [{ type: 'Flag', id }],
    }),
    getSnapshots: builder.query<ReleaseSnapshot[], string | undefined>({
      async queryFn(flagId) {
        await delay()
        const snapshots = readDatabase()
          .snapshots.filter((snapshot) => !flagId || snapshot.flagId === flagId)
          .sort((a, b) => b.version - a.version)
        return { data: snapshots }
      },
      providesTags: (_result, _error, flagId) => [{ type: 'Snapshots', id: flagId ?? 'all' }],
    }),
    saveFlag: builder.mutation<FeatureFlag, FeatureFlag>({
      async queryFn(flag) {
        await delay(260)
        const db = readDatabase()
        const index = db.flags.findIndex((item) => item.id === flag.id)
        const timestamp = new Date().toISOString()
        const next: FeatureFlag = { ...flag, updatedAt: timestamp }
        if (index >= 0) {
          const before = db.flags[index]
          // 审批后的配置更新：未推进环境计划失效重审，已推进环境按快照继续
          applyConfigUpdate(db, before, next)
          db.flags[index] = next
          db.audit.unshift({
            id: `audit-${Date.now()}`,
            flagId: flag.id,
            flagKey: flag.key,
            action: 'updated',
            actor: flag.lastChangedBy,
            summary: '更新开关受众、依赖、版本或回滚条件。',
            before: `rev.${before.configRevision}`,
            after: `rev.${next.configRevision}`,
            affectedUsers: Math.round(900000 * (next.rolloutPercentage / 100)),
            createdAt: timestamp,
          })
        } else {
          db.flags.unshift(next)
          db.audit.unshift({
            id: `audit-${Date.now()}`,
            flagId: next.id,
            flagKey: next.key,
            action: 'created',
            actor: next.lastChangedBy,
            summary: '创建功能开关草稿。',
            after: next.status,
            affectedUsers: 0,
            createdAt: timestamp,
          })
        }
        try {
          writeDatabase(db)
        } catch (error) {
          return {
            error: {
              message: error instanceof Error ? error.message : '配置保存失败，未写入任何数据',
            },
          }
        }
        return { data: next }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    submitForReview: builder.mutation<FeatureFlag, { id: string; actor: string }>({
      async queryFn({ id, actor }) {
        await delay(220)
        const db = readDatabase()
        const flag = db.flags.find((item) => item.id === id)
        if (!flag) return { error: { message: '功能开关不存在' } }
        const timestamp = new Date().toISOString()
        flag.status = 'review'
        flag.updatedAt = timestamp
        flag.lastChangedBy = actor
        db.audit.unshift({
          id: `audit-${Date.now()}`,
          flagId: id,
          flagKey: flag.key,
          action: 'submitted',
          actor,
          summary:
            flag.plan?.status === 'invalidated'
              ? '配置已变更，失效计划重新提交发布影响评审。'
              : '提交发布影响评审。',
          before: 'draft',
          after: 'review',
          affectedUsers: Math.round(900000 * (flag.rolloutPercentage / 100)),
          createdAt: timestamp,
        })
        writeDatabase(db)
        return { data: flag }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    reviewFlag: builder.mutation<FeatureFlag, { id: string; payload: ReviewPayload }>({
      async queryFn({ id, payload }) {
        await delay(260)
        try {
          return { data: applyReview(id, payload) }
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : '审批失败' } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    advanceEnvironment: builder.mutation<
      FeatureFlag,
      { id: string; environment: Environment; actor: string }
    >({
      async queryFn({ id, environment, actor }) {
        await delay(260)
        try {
          return { data: advanceEnvironment(id, environment, actor).flag }
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : '推进失败' } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    freezeEnvironment: builder.mutation<
      FeatureFlag,
      { id: string; environment: Environment; actor: string; frozen: boolean }
    >({
      async queryFn({ id, environment, actor, frozen }) {
        await delay(220)
        try {
          return { data: freezeEnvironment(id, environment, actor, frozen) }
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : '冻结失败' } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    rollbackFlag: builder.mutation<FeatureFlag, { id: string; actor: string; reason: string }>({
      async queryFn({ id, actor, reason }) {
        await delay(260)
        try {
          return { data: rollbackFlag(id, actor, reason) }
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : '回滚失败' } }
        }
      },
      invalidatesTags: ['Flags', 'Dashboard', 'Audit', 'Snapshots'],
    }),
    getIssues: builder.query<ImpactIssue[], { category?: string; resolved?: boolean }>({
      async queryFn(filters) {
        await delay()
        const data = readDatabase().issues.filter(
          (issue) =>
            (!filters.category || issue.category === filters.category) &&
            (filters.resolved === undefined || issue.resolved === filters.resolved),
        )
        return { data }
      },
      providesTags: ['Issues'],
    }),
    getAudit: builder.query<AuditEvent[], { flagId?: string; action?: string }>({
      async queryFn(filters) {
        await delay()
        const data = readDatabase().audit.filter(
          (event) =>
            (!filters.flagId || event.flagId === filters.flagId) &&
            (!filters.action || event.action === filters.action),
        )
        return { data }
      },
      providesTags: ['Audit'],
    }),
  }),
})

export const {
  useGetDashboardQuery,
  useGetFlagsQuery,
  useGetFlagQuery,
  useGetSnapshotsQuery,
  useSaveFlagMutation,
  useSubmitForReviewMutation,
  useReviewFlagMutation,
  useAdvanceEnvironmentMutation,
  useFreezeEnvironmentMutation,
  useRollbackFlagMutation,
  useGetIssuesQuery,
  useGetAuditQuery,
} = flagApi
