export interface ModelRoute { provider: string; model: string }

export function resolveStudioModel(
  getDefaultModel: () => ModelRoute | undefined,
  listProviders: () => Array<{ id: string }>,
): ModelRoute | undefined {
  const configured = getDefaultModel()
  if (configured !== undefined && configured.provider !== '' && configured.model !== '') return configured
  const providers = listProviders()
  if (providers.length === 0) return undefined
  throw new Error('未配置默认模型：请在 Harness 设置 agent-default-model 的 provider 与 model')
}
