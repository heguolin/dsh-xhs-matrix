// @vitest-environment jsdom
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { OverviewTab } from '../src/client/panel/OverviewTab.tsx'
import type { XhsApi } from '../src/client/api.ts'

const here = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(here, '../src/client/panel/panel.module.css'), 'utf8')

const account = { id: 'acc-a', name: '效率研究所', personaId: 'persona-1', enabled: true }

/** 轮询等待条件成立（异步刷新可能在环境慢于固定延时）。 */
async function waitFor(cond: () => boolean, ms = 4000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor timeout')
    await new Promise(r => setTimeout(r, 20))
  }
}

/**
 * 响应式窄宽（768x900，矩阵主区约 296px）：
 * jsdom 无法做真实像素布局，因此按 brief 批准的方案断言
 * 1) 响应式 CSS 规则确实存在（单列网格 + 换行 + 不逐字竖排），
 * 2) 组件在渲染时输出对应的 data-testid/element 结构且操作按钮不隐藏。
 */
describe('OverviewTab 窄宽响应式布局（单列、不逐字竖排、按钮不裁剪）', () => {
  let innerWidth: PropertyDescriptor | undefined
  beforeAll(() => {
    innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')
    Object.defineProperty(window, 'innerWidth', { value: 768, writable: true, configurable: true })
  })
  afterAll(() => {
    if (innerWidth) Object.defineProperty(window, 'innerWidth', innerWidth)
    else Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true })
  })

  it('窄宽下总览容器为单列网格（overview/.metrics 在媒体查询内压平）', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*860px\)/)
    expect(css).toMatch(/\.overview\s*\{[^}]*grid-template-columns:\s*1fr\s*;/)
    expect(css).toMatch(/\.metrics\s*\{[^}]*grid-template-columns:\s*(repeat\(auto-fit|1fr)/)
  })

  it('账号卡片头允许换行且标题不逐字竖排（.accountHead flex-wrap + .accountTitle min-width:0）', () => {
    expect(css).toMatch(/\.accountHead\s*\{[^}]*flex-wrap:\s*wrap\s*;/)
    expect(css).toMatch(/\.accountTitle\s*\{[^}]*min-width:\s*0\s*;/)
    expect(css.match(/\.accountTitle\s*\{[^}]*word-break:\s*break-all/g)).toBeNull()
  })

  it('账号操作按钮（知识库/爆款池/草稿/进入创作台）渲染且位于可换行容器内', async () => {
    const api = {
      listPersonas: async () => [{ id: 'persona-1', name: '干货风' }],
      listDrafts: async () => [],
      listMetrics: async () => [],
      updateAccount: async () => ({ id: 'acc-a' }),
      listNotes: async () => [],
      listViralItems: async () => [],
    } as unknown as XhsApi

    const host = document.createElement('div')
    document.body.appendChild(host)
    const root: Root = createRoot(host)
    root.render(
      <OverviewTab
        api={api}
        accounts={[account]}
        onOpenAccount={() => {}}
        onOpenStudio={() => {}}
        onAccountUpdated={() => {}}
      />,
    )
    // 等账号卡片头渲染（summaries 异步刷新完成后才出现），确保断言的是窄宽下的真实结构
    await waitFor(() => host.querySelector('[data-testid="overview-account-head"]') !== null)

    expect(host.querySelector('[data-testid="overview-root"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="overview-metrics"]')).not.toBeNull()
    const head = host.querySelector('[data-testid="overview-account-head"]')
    expect(head).not.toBeNull()
    const title = host.querySelector('[data-testid="overview-account-title"]')
    expect(title).not.toBeNull()
    expect(title?.textContent ?? '').toContain('效率研究所')
    expect(title?.textContent ?? '').toContain('人设：干货风')

    const actions = host.querySelector('[data-testid="overview-account-actions"]')
    expect(actions).not.toBeNull()
    const text = actions?.textContent ?? ''
    expect(text).toContain('知识库')
    expect(text).toContain('爆款池')
    expect(text).toContain('草稿')
    expect(text).toContain('进入创作台')

    root.unmount()
    host.remove()
  })
})
