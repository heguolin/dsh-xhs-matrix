/** CSS Modules 类型声明：*.module.css 默认导出哈希类名映射。 */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
