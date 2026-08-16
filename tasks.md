# 任务分解

## 阶段一：基础设施（无 UI 变化，可独立验证）

### Task 1: 新建 sessionSort.ts + stableActivityAt 防抖
- [ ] `types.ts`：Session 接口增加 `stableActivityAt: number`
- [ ] `store/index.ts`：`addSession` 初始化 `stableActivityAt = Date.now()`
- [ ] `utils/sessionSort.ts`：新建公共排序函数（用 stableActivityAt）
- [ ] `App.tsx`：`filteredSessions` 改用 `sortSessions()`
- [ ] `App.tsx`：`flushSession` 状态变化时更新 `stableActivityAt`
- [ ] `App.tsx`：空闲检测 `running→idle` 时更新 `stableActivityAt`
- [ ] 验证：两个持续输出的 running 会话不再抖动

### Task 2: 新建 terminalPool.ts 终端实例池
- [ ] 定义 `TerminalInstance` 接口和 `TerminalPool` 类
- [ ] `init()`：订阅 `onSessionOutput` + `onSessionExit`
- [ ] `create(sessionId, theme)`：创建 xterm 实例 + containerDiv
- [ ] `destroy(sessionId)`：dispose 实例 + 清理
- [ ] `attach(sessionId, parent, mode)`：DOM 转移 + fit + resize PTY
- [ ] `detach(sessionId)`：从 DOM 移除（不 dispose）
- [ ] `write(sessionId, data)`：分发到实例
- [ ] `setTheme(theme)`：批量更新主题
- [ ] `dispose()`：清理所有实例 + 取消订阅
- [ ] 导出单例 `terminalPool`

## 阶段二：卡片终端化（核心改造）

### Task 3: SessionCard 预览区改为 xterm 挂载
- [ ] 移除 `preview`/`previewHtml` useMemo 和 ansiToHtml 依赖
- [ ] 预览区改为 `<div ref={previewRef}>`
- [ ] `useEffect`：`pool.attach(session.id, previewRef.current, 'card')`
- [ ] 卸载时 `pool.detach(session.id)`
- [ ] xterm `onData` → `sendInput`（卡片内直接输入）
- [ ] `IntersectionObserver`：不可见时 detach，可见时 attach
- [ ] 预览区样式调整（overflow hidden，xterm 管理滚动）
- [ ] 保留双击进全屏入口

### Task 4: App.tsx 适配实例池
- [ ] 初始化时 `terminalPool.init()`
- [ ] 会话创建后 `terminalPool.create(sessionId, theme)`
- [ ] 会话删除时 `terminalPool.destroy(sessionId)`
- [ ] `flushSession` 降频：`FLUSH_INTERVAL` 16ms → 100ms
- [ ] 移除进入全屏时的强制 flush（实例已有实时数据）
- [ ] 主题变化时 `terminalPool.setTheme(theme)`

### Task 5: FullscreenTerminal 改为从池获取实例
- [ ] 移除 `initTerminal` 中的 `new Terminal()` + `open()`
- [ ] 移除 `selectReplayContent` 回放逻辑
- [ ] 移除单独的 `onSessionOutput` 订阅（池统一分发）
- [ ] `useEffect([activeSessionId])`：`pool.attach(activeId, termRef, 'fullscreen')`
- [ ] cleanup：`pool.detach(activeId)`（不 dispose）
- [ ] `resizePtyToXterm` 从池获取实例
- [ ] 主题热更新改为 `pool.setTheme(theme)`
- [ ] 保留 Ctrl+Alt+方向键切换（从池读实例）
- [ ] 保留智能滚动逻辑（从池读 buffer）

## 阶段三：全屏底部列表优化

### Task 6: 底部列表排序 + 样式 + hover 预览
- [ ] `otherSessions` 改用 `sortSessions()`
- [ ] 胶囊高度 24px → 28px，字体 11px → 12px
- [ ] 名称截断 8 字符 → 12 字符
- [ ] hover Tooltip 取 previewText 尾部 6 行 + ansiToHtml 渲染
- [ ] Tooltip 状态色左边框
- [ ] 横向滚动渐变遮罩

## 阶段四：样式优化

### Task 7: 整体样式优化
- [ ] 卡片圆角 10px → 12px
- [ ] 卡片阴影统一
- [ ] 有状态卡片左边框 3px 状态色
- [ ] 全屏顶栏 44px → 48px
- [ ] 全屏底栏 40px → 48px
- [ ] 空状态样式优化

## 阶段五：验证与打包

### Task 8: 功能验证
- [ ] 5 会话持续输出不抖动
- [ ] 卡片内直接输入命令
- [ ] 双击进全屏无闪烁
- [ ] 全屏底部列表排序 + hover 预览
- [ ] Ctrl+Alt+切换无闪烁
- [ ] 退出全屏卡片恢复
- [ ] 删除会话实例销毁
- [ ] 20 会话压力测试

### Task 9: 构建打包
- [ ] `npm run build` 编译通过
- [ ] `npm run dist:win` 生成 EXE
