interface AppIconProps {
  size?: number
}

// TCommander 图标：终端窗口主体 + 命令提示符 `>_` + 右上角指挥星章
export default function AppIcon({ size = 24 }: AppIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="tcmd-bg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="tcmd-accent" x1="10" y1="14" x2="52" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>

      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#tcmd-bg)" />
      <rect x="4" y="4" width="56" height="56" rx="14" stroke="url(#tcmd-accent)" strokeWidth="1.5" strokeOpacity="0.6" />

      {/* 终端窗口顶栏圆点 */}
      <circle cx="14" cy="13" r="1.8" fill="#f87171" />
      <circle cx="21" cy="13" r="1.8" fill="#fbbf24" />
      <circle cx="28" cy="13" r="1.8" fill="#34d399" />

      {/* 命令提示符 `>` */}
      <path d="M14 27 L23 33 L14 39" stroke="url(#tcmd-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

      {/* 光标下划线 `_` */}
      <line x1="29" y1="39" x2="40" y2="39" stroke="url(#tcmd-accent)" strokeWidth="3" strokeLinecap="round" />

      {/* 右上角指挥官星章（commander 徽章） */}
      <path
        d="M50 12 L52.2 16.8 L57.5 17.3 L53.5 20.9 L54.7 26 L50 23.4 L45.3 26 L46.5 20.9 L42.5 17.3 L47.8 16.8 Z"
        fill="url(#tcmd-accent)"
      />
    </svg>
  )
}
