/**
 * 真实组件渲染冒烟测试：用 jsdom 加载构建产物，验证 Redux store、
 * RTK Query 数据链路与快照数据初始化在“浏览器”中可用。
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')
const jsFile = html.match(/src="([^"]+\.js)"/)?.[1]
if (!jsFile) throw new Error('构建产物中未找到 js 入口')
const script = readFileSync(new URL(`../dist${jsFile}`, import.meta.url), 'utf8')

const dom = new JSDOM(html.replace(/<script[^>]*src=[^>]*><\/script>/, ''), {
  url: 'http://localhost:18472/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
})

const { window } = dom
window.HTMLElement.prototype.scrollIntoView = () => {}
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('渲染超时')), 15000)
  let rendered = false
  const observer = new window.MutationObserver(() => {
    const bodyText = window.document.body.textContent ?? ''
    if (bodyText.includes('今日发布态势') && bodyText.includes('灰度发布')) rendered = true
  })
  observer.observe(window.document.body, { childList: true, subtree: true })
  window.eval(script)
  // 标题是静态内容；等待 RTK Query（含模拟延迟）落库并渲染数据卡片
  setTimeout(() => {
    clearTimeout(timeout)
    if (!rendered) return reject(new Error('应用未渲染'))
    setTimeout(resolve, 800)
  }, 600)
})

const text = window.document.body.textContent ?? ''
const checks = [
  ['仪表盘标题渲染', text.includes('今日发布态势')],
  ['导航包含灰度发布', text.includes('灰度发布')],
  ['localStorage 已写入种子数据', window.localStorage.getItem('feature-flag-release-console-v1') !== null],
]

const stored = JSON.parse(window.localStorage.getItem('feature-flag-release-console-v1'))
checks.push(['数据库包含 snapshots 表', Array.isArray(stored.snapshots) && stored.snapshots.length >= 5])
checks.push([
  '每份快照均含受众规则/依赖/回滚阈值/checksum',
  stored.snapshots.every(
    (s) =>
      Array.isArray(s.payload.audienceRules) &&
      Array.isArray(s.payload.dependencies) &&
      Array.isArray(s.payload.rollbackThresholds) &&
      typeof s.checksum === 'string',
  ),
])
checks.push([
  '已发布开关的已推进环境都绑定了快照',
  stored.flags
    .filter((f) => f.plan)
    .flatMap((f) => f.plan.environments)
    .filter((rt) => rt.state !== 'awaiting')
    .every((rt) => Boolean(rt.snapshotId)),
])
checks.push([
  '断链字段结构完整',
  stored.flags
    .flatMap((f) => f.plan?.environments ?? [])
    .every((rt) => Array.isArray(rt.brokenChains)),
])

let failed = 0
for (const [name, ok] of checks) {
  if (!ok) {
    failed += 1
    console.log(`  ✗ ${name}`)
  } else {
    console.log(`  ✓ ${name}`)
  }
}
if (failed > 0) process.exit(1)
console.log(`\n冒烟测试全部通过 ✅（${checks.length} 项）`)
