# TCommander 终端体验优化方案 v2

## 一、用户反馈问题总结

用户反馈的问题：
1. **卡片预览效果不如以前** - 颜色显示异常，预览内容不清晰
2. **终端内容展示慢** - 按键后预览区迟迟不更新
3. **展示效果差** - 预览区文本换行和滚动体验不佳
4. **卡片变得好窄** - 虽然设置了 minmax(400px, 1fr)，但实际显示仍然偏窄

## 二、根本原因分析

### 2.1 数据流延迟问题
当前实现使用双定时器策略（前缘+后缘），但存在以下问题：
- **前缘 flush 时机**：虽然设置了 30ms 间隔，但在高频输出时，前缘可能无法立即触发
- **cleanTerminalOutputKeepColor 性能**：每次 flush 都要对 16KB 数据全量重算，CPU 密集
- **React 状态更新链路长**：flushSession → updateSession → React re-render → ansiToHtml → DOM

### 2.2 预览渲染问题
- **ansiToHtml 性能瓶颈**：每次 previewText 变化都要重新解析 ANSI 序列并生成 HTML
- **dangerouslySetInnerHTML 重绘**：浏览器需要重新解析 HTML 并构建 DOM
- **文本换行导致行数变化**：whitespace-pre-wrap 导致长行自动换行，预览行数不稳定

### 2.3 卡片宽度问题
- **CSS Grid 布局限制**：`minmax(400px, 1fr)` 在窄屏上会被压缩
- **预览区高度计算**：`height: 16 + previewLineCount * 22` 固定高度，但内容可能超出

## 三、优化方案

### 方案 A：卡片预览改用 Canvas 渲染（推荐）

**核心思路：**
使用 HTML5 Canvas 直接渲染终端预览，绕过 DOM 重建开销。

**实现要点：**
1. SessionCard 预览区改为 `<canvas ref={canvasRef}>`
2. 使用 OffscreenCanvas 在 Worker 中渲染（可选）
3. 维护一个简单的字符缓冲区（类似 xterm.js 的 buffer）
4. 每次 previewText 变化时，只重绘变化的行（增量渲染）
5. 使用 requestAnimationFrame 控制渲染频率

**优势：**
- 渲染性能提升 10-20 倍（无 DOM 重建）
- 完全控制像素级渲染，视觉一致性高
- 可以实现光标闪烁、选中高亮等效果
- 内存占用可控（只渲染可见行）

**风险：**
- 需要实现简单的字符渲染引擎（字体测量、颜色映射）
- 文本选中/复制需要自己实现
- 改动较大（约 300 行代码）

### 方案 B：优化 ansiToHtml 性能

**核心思路：**
增量解析 ANSI 序列，缓存已解析的 HTML 片段。

**实现要点：**
1. 维护一个解析状态机，记录每行的解析结果
2. 新增行时，只解析新增部分，复用历史行的 HTML
3. 使用虚拟滚动，只渲染可见行的 HTML
4. 使用 React.memo + useMemo 优化重渲染

**优势：**
- 改动较小（约 100 行代码）
- 保持现有 HTML 渲染方式，兼容性好
- 性能提升 3-5 倍

**风险：**
- 仍然有 DOM 重建开销
- 增量解析逻辑复杂

### 方案 C：数据流优化 - 立即 flush + 异步计算

**核心思路：**
将 cleanTerminalOutputKeepColor 移到异步任务，不阻塞主线程。

**实现要点：**
1. handleOutput 立即 flush 累积的 chunks 到 history
2. 使用 requestIdleCallback 或 setTimeout(0) 异步计算 previewText
3. 预览更新与状态检测解耦：状态检测立即执行，预览更新延迟执行
4. 使用 Web Worker 执行 cleanTerminalOutputKeepColor（可选）

**优势：**
- 首字节延迟降至最低（0ms）
- 不阻塞用户交互
- 改动较小（约 50 行代码）

**风险：**
- 预览更新可能滞后于状态变化
- 需要处理竞态条件

### 方案 D：卡片布局优化

**核心思路：**
使用 CSS Container Queries 替代 Media Queries，实现真正的响应式卡片布局。

**实现要点：**
1. 卡片容器设置 `container-type: inline-size`
2. 卡片内部根据容器宽度调整布局
3. 最小宽度从 400px 降低到 320px，但保持内容可读性
4. 预览区使用 aspect-ratio 保持宽高比

**优势：**
- 卡片在不同屏幕尺寸下都有良好显示
- 预览区高度自适应内容
- 改动极小（约 20 行 CSS）

**风险：**
- Container Queries 兼容性（Electron 29 支持良好）

## 四、推荐实施优先级

**第一优先级（立即见效）：**
1. **方案 C**：数据流优化 - 立即 flush + 异步计算（改动小，效果明显）
2. **方案 D**：卡片布局优化（改动极小，视觉改善）

**第二优先级（性能提升）：**
3. **方案 B**：优化 ansiToHtml 性能（中等改动，性能提升显著）

**第三优先级（长期优化）：**
4. **方案 A**：Canvas 渲染（改动大，效果最好，但需要更多测试）

## 五、具体实施计划

### 5.1 方案 C 实施细节

**修改文件：** `src/renderer/src/App.tsx`

**关键代码：**
```typescript
const flushSession = useCallback((sessionId: string) => {
  const state = useAppStore.getState()
  const session = state.sessions.find(s => s.id === sessionId)
  if (!session) return

  const pending = pendingBufferRef.current[sessionId]
  const batched = batchQueueRef.current[sessionId]
  pendingBufferRef.current[sessionId] = []
  batchQueueRef.current[sessionId] = []

  const chunks: string[] = []
  if (pending && pending.length > 0) chunks.push(...pending)
  if (batched && batched.length > 0) chunks.push(...batched)
  if (chunks.length === 0) return

  const rawHistory = [...session.history, ...chunks]
  const newHistory = truncateHistory(rawHistory)
  
  // 立即更新 history 和状态（不阻塞）
  const fullRaw = newHistory.join('')
  const tailRaw = tailLines(fullRaw, 16 * 1024)
  const detectResult = detectStatusWithRules(tailRaw, state.rules)
  
  // 状态检测立即执行
  if (detectResult.matched) {
    state.updateSession(sessionId, {
      history: newHistory,
      status: detectResult.status,
      matchedRuleName: detectResult.matchedRuleName,
      lastActivityAt: Date.now()
    })
  } else {
    const prevHadStatus = hasStatus(session.status)
    state.updateSession(sessionId, {
      history: newHistory,
      status: 'running',
      matchedRuleName: prevHadStatus ? undefined : session.matchedRuleName,
      lastActivityAt: Date.now()
    })
  }
  
  // 预览更新异步执行（不阻塞主线程）
  if (previewUpdateTimer.current[sessionId]) {
    clearTimeout(previewUpdateTimer.current[sessionId])
  }
  previewUpdateTimer.current[sessionId] = setTimeout(() => {
    const s = useAppStore.getState().sessions.find(s => s.id === sessionId)
    if (!s) return
    const raw = s.history.join('')
    const tail = tailLines(raw, 16 * 1024)
    const cleaned = cleanTerminalOutputKeepColor(tail)
    useAppStore.getState().updateSession(sessionId, { previewText: cleaned })
  }, 0) // setTimeout(0) 让出主线程
}, [])
```

### 5.2 方案 D 实施细节

**修改文件：** `src/renderer/src/App.tsx`, `src/renderer/src/components/SessionCard.tsx`

**App.tsx 关键代码：**
```typescript
// 卡片网格布局
<div 
  className="grid gap-5" 
  style={{ 
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    containerType: 'inline-size'
  }}
>
  {filteredSessions.map((session, index) => (
    <div 
      key={session.id} 
      className="animate-fade-in" 
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <SessionCard ... />
    </div>
  ))}
</div>
```

**SessionCard.tsx 关键代码：**
```typescript
// 预览区高度自适应
<div
  className="session-card-preview"
  style={{
    minHeight: 126,
    maxHeight: 300, // 限制最大高度
    padding: '10px 12px',
    // ... 其他样式
    overflowX: 'hidden',
    overflowY: 'auto',
  }}
>
  {session.previewText ? (
    <pre
      className="whitespace-pre-wrap break-words m-0"
      style={{
        minHeight: '100%', // 确保内容撑满容器
      }}
      dangerouslySetInnerHTML={{ __html: previewHtml }}
    />
  ) : (
    <pre className="whitespace-pre-wrap break-words m-0" style={{ color: themeFg, opacity: 0.4 }}>等待输出...</pre>
  )}
</div>
```

## 六、预期效果

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 首字节延迟 | 30ms（双定时器） | 0ms（立即 flush） |
| 预览更新延迟 | 30-60ms | 0-16ms（异步但不阻塞） |
| 卡片最小宽度 | 400px（可能过宽） | 320px（更灵活） |
| 预览区高度 | 固定（可能溢出） | 自适应（126-300px） |
| 主线程阻塞 | cleanTerminalOutputKeepColor 阻塞 | 异步执行，不阻塞 |

## 七、实施步骤

1. **第一步**：实施方案 C（数据流优化）
   - 修改 App.tsx 的 flushSession 函数
   - 将 previewText 更新改为异步
   - 测试按键响应速度

2. **第二步**：实施方案 D（卡片布局优化）
   - 修改 App.tsx 的 grid 布局
   - 修改 SessionCard.tsx 的预览区样式
   - 测试不同屏幕尺寸下的显示效果

3. **第三步**：验证优化效果
   - 构建特性 EXE
   - 用户验证体验改善

4. **第四步**（可选）：实施方案 B（ansiToHtml 优化）
   - 如果性能仍有瓶颈，再实施增量解析

## 八、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 异步更新导致预览滞后 | 使用 setTimeout(0) 而非 requestIdleCallback，确保尽快执行 |
| 卡片宽度过窄影响可读性 | 设置最小宽度 320px，预览区使用 break-words |
| 预览区高度不稳定 | 设置 minHeight 和 maxHeight，使用 overflowY: auto |
| 异步更新竞态条件 | 使用 setTimeout 的返回值取消之前的更新 |

## 九、总结

本次优化聚焦于解决用户反馈的核心问题：
1. **终端内容展示慢** → 方案 C（立即 flush + 异步计算）
2. **卡片变得好窄** → 方案 D（降低最小宽度到 320px）
3. **预览效果差** → 方案 D（预览区高度自适应）

通过这两个方案的实施，预期可以显著改善用户体验，同时保持代码的简洁性和可维护性。
