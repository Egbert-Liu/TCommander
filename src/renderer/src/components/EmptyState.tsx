interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  /** 图标容器底色（默认主色渐变）；状态空状态可传对应状态色 */
  tint?: string
  children?: React.ReactNode
}

/**
 * 统一空状态：渐变图标容器 + 标题/描述 + 可选操作区。
 * 以片段返回，由外层 flex 容器控制整体布局（与 App.tsx 的空状态排布一致）。
 */
export default function EmptyState({ icon, title, description, tint, children }: EmptyStateProps) {
  return (
    <>
      <div
        className="w-16 h-16 rounded-xl flex items-center justify-center"
        style={{ background: tint ?? 'linear-gradient(135deg, rgba(56,189,248,0.12) 0%, rgba(129,140,248,0.12) 100%)' }}
      >
        {icon}
      </div>
      <div className="text-center">
        <p style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13, marginBottom: 2 }}>{title}</p>
        {description && (
          <p style={{ color: 'var(--ant-color-text-tertiary)', fontSize: 11 }}>{description}</p>
        )}
      </div>
      {children}
    </>
  )
}
