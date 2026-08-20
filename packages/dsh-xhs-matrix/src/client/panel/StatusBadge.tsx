import css from './panel.module.css'

/** 账号/采集/数据来源状态徽标。 */
export function StatusBadge({ status, source }: { status: string; source?: string }) {
  const labels: Record<string, string> = {
    unbound: '未绑定',
    bound: '已绑定',
    authorized: '已授权',
    'awaiting-import': '待导入',
    failed: '失败',
    expired: '已失效',
    idle: '空闲',
    success: '成功',
    running: '采集中',
    manual: '手动',
    import: '导入',
    apify: 'Apify',
  }
  const text = labels[status] ?? (labels[source ?? ''] ?? status)
  const failed = status === 'failed'
  const running = status === 'running'
  return <span className={`${failed ? css.badgeDanger : running ? css.badgeWarn : css.badgeGreen} ${css.badge}`}>{text}</span>
}
