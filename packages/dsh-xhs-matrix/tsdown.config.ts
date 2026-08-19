import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  format: ['esm'],
  outDir: 'lib',
  platform: 'browser',
  // clean: false 是必需的：tsdown 默认 clean 整个 outDir，会抹掉 tsc 先产出的
  // lib/index.js 与 lib/types/**（与 dsh-ssh 模板的 shared/tsdown.client.ts 一致）。
  // dts: false：类型声明由 tsc 的 declarationDir 产出（lib/types/**），
  // tsdown 不再重复生成 lib/client.d.ts。
  clean: false,
  dts: false,
  external: ['react', 'react-dom', /^@deepseek-ai\//],
  sourcemap: true,
})
