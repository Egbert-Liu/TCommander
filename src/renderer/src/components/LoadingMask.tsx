import { Spin } from 'antd'
import { useAppStore } from '../store'

/**
 * 全局 loading 蒙板
 *  - 监听 store.globalLoading.open；true 时铺满整个窗口
 *  - 背景半透明 + 模糊，文字居中显示当前操作的说明
 *  - 用于「关闭应用」「关闭会话」「重置会话」等需要等待 PTY 资源释放的场景
 */
export default function LoadingMask() {
  const loading = useAppStore((s) => s.globalLoading)
  if (!loading.open) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'all',
        cursor: 'wait',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '20px 28px',
          borderRadius: 12,
          background: 'var(--ant-color-bg-elevated, #1f1f1f)',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          minWidth: 200,
        }}
      >
        <Spin size="large" />
        <div
          style={{
            color: 'var(--ant-color-text, #fff)',
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          {loading.text || '正在处理...'}
        </div>
      </div>
    </div>
  )
}
