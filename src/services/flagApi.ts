import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import {
  advanceEnvironment,
  applyReview,
  freezeRollout,
  getDashboardStats,
  readDatabase,
  resolveIssue,
  rollbackFlag,
  saveFlagConfig,
  submitFlagForReview,
} from '@/services/database'
import type {
  AuditEvent,
  DashboardData,
  Environment,
  FeatureFlag,
  FlagFilter,
  ImpactIssue,
  ReleasePlan,
  ReleaseSnapshot,
  ReviewPayload,
} from '@/types'

const delay = (milliseconds = 180) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds))

const toErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export const flagApi = createApi({
  reducerPath: 'flagApi',
  baseQuery: fakeBaseQuery<{ message: string }>(),
  tagTypes: ['Flags', 'Flag', 'Issues', 'Audit', 'Dashboard', 'Plans', 'Snapshots'],
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
    getSnapshots: builder.query<ReleaseSnapshot[], string | void>({
      async queryFn(flagId) {
        await delay()
        const data = readDatabase()
          .snapshots.filter((snapshot) => !flagId || snapshot.flagId === flagId)
          .sort((left, right) => right.version - left.version)
        return { data }
      },
      providesTags: ['Snapshots'],
    }),
    getReleasePlans: builder.query<ReleasePlan[], void>({
      async queryFn() {
        await delay()
        return { data: readDatabase().plans }
      },
      providesTags: ['Plans'],
    }),
    getReleasePlan: builder.query<ReleasePlan | null, string>({
      async queryFn(flagId) {
        await delay()
        const plan = readDatabase().plans.find((item) => item.flagId === flagId)
        return { data: plan ?? null }
      },
      providesTags: (_result, _error, flagId) => [{ type: 'Plans', id: flagId }],
    }),
    saveFlag: builder.mutation<
      { flag: FeatureFlag; invalidatedEnvironments: Environment[] },
      FeatureFlag
    >({
      async queryFn(flag) {
        await delay(260)
        try {
          return { data: saveFlagConfig(flag) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '保存失败') } }
        }
      },
      invalidatesTags: ['Flags', 'Dashboard', 'Audit', 'Plans', 'Snapshots'],
    }),
    submitForReview: builder.mutation<FeatureFlag, { id: string; actor: string }>({
      async queryFn({ id, actor }) {
        await delay(220)
        try {
          return { data: submitFlagForReview(id, actor) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '提交评审失败') } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Plans',
        { type: 'Flag', id: arg.id },
      ],
    }),
    reviewFlag: builder.mutation<
      { flag: FeatureFlag; snapshot: ReleaseSnapshot | null },
      { id: string; payload: ReviewPayload }
    >({
      async queryFn({ id, payload }) {
        await delay(260)
        try {
          return { data: applyReview(id, payload) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '审批失败') } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Plans',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    advanceEnvironment: builder.mutation<
      ReleasePlan,
      { flagId: string; environment: Environment; actor: string }
    >({
      async queryFn({ flagId, environment, actor }) {
        await delay(260)
        try {
          return { data: advanceEnvironment(flagId, environment, actor) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '推进失败') } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Plans',
        { type: 'Flag', id: arg.flagId },
      ],
    }),
    freezeRollout: builder.mutation<FeatureFlag, { id: string; actor: string }>({
      async queryFn({ id, actor }) {
        await delay(220)
        try {
          return { data: freezeRollout(id, actor) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '冻结失败') } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Plans',
        { type: 'Flag', id: arg.id },
      ],
    }),
    rollbackFlag: builder.mutation<
      { flag: FeatureFlag; impactedPlans: string[] },
      { id: string; actor: string; reason: string }
    >({
      async queryFn({ id, actor, reason }) {
        await delay(260)
        try {
          return { data: rollbackFlag(id, actor, reason) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '回滚失败') } }
        }
      },
      invalidatesTags: (_result, _error, arg) => [
        'Flags',
        'Dashboard',
        'Audit',
        'Plans',
        'Snapshots',
        { type: 'Flag', id: arg.id },
      ],
    }),
    resolveIssue: builder.mutation<ImpactIssue, { id: string; actor: string }>({
      async queryFn({ id, actor }) {
        await delay(200)
        try {
          return { data: resolveIssue(id, actor) }
        } catch (error) {
          return { error: { message: toErrorMessage(error, '操作失败') } }
        }
      },
      invalidatesTags: ['Issues', 'Audit', 'Dashboard'],
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
  useGetReleasePlansQuery,
  useGetReleasePlanQuery,
  useSaveFlagMutation,
  useSubmitForReviewMutation,
  useReviewFlagMutation,
  useAdvanceEnvironmentMutation,
  useFreezeRolloutMutation,
  useRollbackFlagMutation,
  useResolveIssueMutation,
  useGetIssuesQuery,
  useGetAuditQuery,
} = flagApi
