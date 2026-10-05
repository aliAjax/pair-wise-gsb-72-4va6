import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { RouterProvider } from 'react-router-dom'
import { store } from '@/app/store'
import { theme } from '@/app/theme'
import { router } from '@/app/router'
import { readDatabase, setFailNextWrite, writeDatabase } from '@/services/database'
import '@/styles.css'

// 演示/自检入口（仅开发环境）：
// window.__releaseDemo.failNextWrite() —— 模拟快照保存失败，验证不会留下半套计划
// window.__releaseDemo.corruptLatestSnapshot(flagId) —— 破坏快照校验和，重开后从上一个完整快照恢复
if (import.meta.env.DEV) {
  ;(window as unknown as { __releaseDemo?: unknown }).__releaseDemo = {
    failNextWrite: () => {
      setFailNextWrite(true)
      return '下一次写入将失败，审批/推进应整笔拒绝'
    },
    corruptLatestSnapshot: (flagId?: string) => {
      const db = readDatabase()
      const target = [...db.snapshots]
        .reverse()
        .find((snapshot) => !flagId || snapshot.flagId === flagId)
      if (!target) return '未找到快照'
      target.payload.rollbackThresholds.push('被破坏的阈值')
      writeDatabase(db)
      return `已破坏快照 ${target.id}，刷新页面查看自愈`
    },
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
)
