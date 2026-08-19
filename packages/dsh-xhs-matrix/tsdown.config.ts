/**
 * dsh-xhs-matrix 双半构建配置（对齐 core repo 的 tsdown.client.ts 参考实现）：
 * - tsc -p tsconfig.build.json 只产出声明（lib/types/**），本配置不再产出 d.ts。
 * - Node 半：src/index.ts → lib/index.js、src/invariant.ts → lib/invariant.js
 *   （ESM，宿主提供 @deepseek-ai/* / node:* / schemastery）。
 * - Client 半：src/client/index.ts → lib/client.js（CJS），包成 dsh web shell 要求的
 *   window.__ModuleLoader__.load({ id, factory: (require) => {...} }) 闭包格式；
 *   externals 通过注入的 require 从 loader 模块表解析。
 * - CSS Modules：tsdown 自带 css 管线不可用（需 @tsdown/css），沿用 core repo 的
 *   虚拟 id 内联方案 —— lightningcss 编译 *.module.css 为哈希类名映射，
 *   并在 factory 执行时注入 <style data-plugin="dsh-xhs-matrix">。
 */
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath, sep } from 'node:path'
import { transform } from 'lightningcss'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const PLUGIN_ID: string = pkg.name

/**
 * 虚拟 id 包装：把模块 CSS 挡在 tsdown 自己的 css 管线之外（该管线需要
 * @tsdown/css）。后缀有讲究：tsdown 的守卫匹配以 `.css` 结尾的 id，
 * 所以虚拟 id 不能以 .css 结尾。
 */
const CSS_VIRTUAL_PREFIX = '\0xhs-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** CSS Modules 内联插件：resolveId 把 *.module.css 映射为虚拟 id，load 编译并导出类名映射。 */
const cssModulesInline = {
  name: 'xhs-css-modules-inline',
  resolveId(source: string, importer: string | undefined) {
    if (!source.endsWith('.module.css')) return null
    const abs = importer !== undefined ? sourceAssetPath(source, importer) : source
    return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
  },
  async load(this: { addWatchFile: (id: string) => void }, virtualId: string) {
    if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
    const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
    // 虚拟 id 会把物理样式表从 Rolldown 的 watch 图里藏起来，这里补注册。
    this.addWatchFile(fileId)
    const source = await readFile(fileId)
    const { code, exports: cssExports } = transform({
      filename: fileId,
      code: source,
      cssModules: { pattern: '[hash]_[local]' },
      minify: true,
    })
    const classMap: Record<string, string> = {}
    for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
    // 每个模块文件一个 <style data-plugin>；重复求值幂等。
    return [
      `const css = ${JSON.stringify(code.toString())};`,
      `const tagId = ${JSON.stringify(`${PLUGIN_ID}/${basename(fileId)}`)};`,
      'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
      '  const tag = document.createElement(\'style\');',
      `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
      '  tag.dataset.pluginCss = tagId;',
      '  tag.textContent = css;',
      '  document.head.appendChild(tag);',
      '}',
      `export default ${JSON.stringify(classMap)};`,
    ].join('\n')
  },
}

/** Node 半：宿主在运行时提供 @deepseek-ai/*、node:* 与 schemastery，均保持 external。 */
const nodeConfig = {
  name: PLUGIN_ID,
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  external: [/^@deepseek-ai\//, /^node:/, 'schemastery'],
}

/** Client 半：CJS 闭包格式，entryFileNames 钉死 lib/client.js；clean 必须关闭以免抹掉 node 半产物。 */
const clientConfig = {
  name: `${PLUGIN_ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', /^@deepseek-ai\//],
  plugins: [cssModulesInline],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

/** 函数形式与 core repo 的 clientBundle 一致（tsdown 0.22 的 UserConfigFn）。 */
export default ({ env }: { env?: Record<string, string> }) => [nodeConfig, clientConfig]

/** 把产物侧的相对导入解析回源码树对应的物理文件（dev 时 importer 即源码路径）。 */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}
