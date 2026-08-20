import { describe, expect, it } from 'vitest'
import { resolveStudioModel } from '../src/model-config.ts'

describe('resolveStudioModel', () => {
  it('优先用 agent-default-model', () => {
    const route = resolveStudioModel(() => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }), () => [{ id: 'other' }])
    expect(route).toEqual({ provider: 'deepseek-official', model: 'deepseek-v4-flash' })
  })
  it('默认缺失时用第一个注册 provider 并报缺 model', () => {
    expect(() => resolveStudioModel(() => undefined, () => [{ id: 'openai-compatible' }])).toThrow(/model/)
  })
  it('两者皆无返回 undefined', () => {
    expect(resolveStudioModel(() => undefined, () => [])).toBeUndefined()
  })
})
