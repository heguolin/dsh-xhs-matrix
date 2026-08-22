import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { buildStudioLlmClient } from '../src/index.ts'

/** 空流：不产生任何 chunk。 */
const NOOP_STREAM = async function* (): AsyncGenerator<StreamChunk> {}

describe('buildStudioLlmClient（创作台模型装配）', () => {
  it('模型解析失败时插件照常构建：仅 complete 给明确中文错误', async () => {
    // 未配置 agent-default-model 且存在注册 provider：resolveStudioModel 抛错，必须被上层捕获，
    // 否则 sync() 中断会导致路由/工具/公告全部不注册。
    const setup = buildStudioLlmClient(() => undefined, () => [{ id: 'openai-compatible' }], () => NOOP_STREAM())
    expect(setup.modelLabel).toBe('未配置')
    await expect(setup.client.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] }))
      .rejects.toThrow('未配置创作台模型：请在 Harness 设置 agent-default-model（provider 与 model）')
  })

  it('无注册 provider 时同样返回未配置错误（不阻塞插件加载）', async () => {
    const setup = buildStudioLlmClient(() => undefined, () => [], () => NOOP_STREAM())
    expect(setup.modelLabel).toBe('未配置')
    await expect(setup.client.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] }))
      .rejects.toThrow(/未配置创作台模型/)
  })

  it('配置默认模型时 complete 经 stream 返回文本', async () => {
    const stream = async function* (): AsyncGenerator<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '你好' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } }
    }
    const setup = buildStudioLlmClient(() => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }), () => [], () => stream())
    expect(setup.modelLabel).toBe('deepseek-official/deepseek-v4-flash')
    const { text } = await setup.client.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] })
    expect(text).toBe('你好')
  })

  it('finish error 时 complete 抛错并包含 provider failure 详情', async () => {
    // 模拟 provider 抛出后被 dsh-llm 归一化为终态 finish error chunk：
    // 必须把 failure.message（如 'provider: invalid api key'）带进抛错信息，而不能丢弃。
    const stream = async function* (): AsyncGenerator<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '你好' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } }
      yield { type: 'finish', reason: { kind: 'error', failure: { message: 'provider: invalid api key', code: '401' } } }
    }
    const setup = buildStudioLlmClient(() => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }), () => [], () => stream())
    await expect(setup.client.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] }))
      .rejects.toThrow(/provider: invalid api key/)
  })

  it('正常 finish stop 流不抛错并返回文本', async () => {
    const stream = async function* (): AsyncGenerator<StreamChunk> {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '你好' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '你好' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
    const setup = buildStudioLlmClient(() => ({ provider: 'deepseek-official', model: 'deepseek-v4-flash' }), () => [], () => stream())
    const { text } = await setup.client.complete({ system: 's', messages: [{ role: 'user', content: 'c' }] })
    expect(text).toBe('你好')
  })
})
