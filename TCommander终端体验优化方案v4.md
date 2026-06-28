# TCommander 终端体验优化方案 v4

## 一、用户反馈问题总结

用户反馈的核心问题:
1. **卡片变得好窄** - 当前 `minmax(400px, 1fr)` 导致卡片宽度不足
2. **终端内容展示慢** - requestAnimationFrame 节流导致延迟
3. **预览效果差** - 预览区样式和渲染方式需要优化

## 二、根本原因分析

### 2.1 卡片宽度问题
App.tsx 第686行:
```typescript
<div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))' }}>
```

**问题分析:**
- `minmax(400px, 1fr)` 在某些屏幕尺寸下会导致卡片过窄
- 终端内容(特别是长命令、表格等)需要更宽的显示空间
- 用户期望卡片宽度至少 500px 以上

### 2.2 数据流延迟问题
App.tsx 第171-179行使用 requestAnimationFrame 节流:
```typescript
const rafIdRef = useRef<Record<string, number>>({})

// 在 handleOutput 中:
if (rafIdRef.current[sessionId] != null) {
  return
}
rafIdRef.current[sessionId] = requestAnimationFrame(() => {
  delete rafIdRef.current[sessionId]
  flushSession(sessionId)
})
```

**问题分析:**
- requestAnimationFrame 会在下一帧(约16ms后)执行
- 连续输出时,后续 chunk 会被累积,但首字节仍有延迟
- 用户感知到"按键后预览迟迟不更新"

### 2.3 预览区样式问题
SessionCard.tsx 第527-598行:
- 使用 `whitespace-pre-wrap break-words` 导致长行自动换行
- 预览区高度固定,但内容可能超出
- 颜色渲染可能存在问题

## 三、新优化方案

### 方案 A: 卡片宽度优化(解决"卡片窄")

**核心思路:**
- 将卡片最小宽度从 400px 增加到 500px
- 确保卡片在各种屏幕尺寸下都有足够的显示空间

**实现要点:**
1. 修改 App.tsx 第686行的 grid 布局
2. 将 `minmax(400px, 1fr)` 改为 `minmax(500px, 1fr)`

**关键代码:**
```typescript
// App.tsx 第686行
<div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))' }}>
```

**预期效果:**
- 卡片最小宽度从 400px 增加到 500px
- 终端内容有更充足的显示空间
- 长命令、表格等内容不会被压缩

### 方案 B: 数据流即时更新(解决"展示慢")

**核心思路:**
- 移除 requestAnimationFrame 节流
- 每次 PTY 输出立即更新状态
- 牺牲少量性能换取即时响应

**实现要点:**
1. 移除 App.tsx 中的 rafIdRef 相关代码
2. 在 handleOutput 中直接调用 flushSession
3. 不再使用 requestAnimationFrame 延迟

**关键代码:**
```typescript
// App.tsx - 移除 rafIdRef 定义

// handleOutput 函数中:
const handleOutput = (sessionId: string, data: string) => {
  const state = useAppStore.getState()
  const session = state.sessions.find(s => s.id === sessionId)

  if (!session) {
    if (!pendingBufferRef.current[sessionId]) {
      pendingBufferRef.current[sessionId] = []
    }
    pendingBufferRef.current[sessionId].push(data)
    return
  }

  if (!batchQueueRef.current[sessionId]) {
    batchQueueRef.current[sessionId] = []
  }
  batchQueueRef.current[sessionId].push(data)

  // 立即 flush,不使用 requestAnimationFrame
  flushSession(sessionId)
}
```

**预期效果:**
- 首字节延迟从 ~16ms 降至 0ms
- 用户按键后预览立即更新
- 可能会有轻微性能损耗(但用户更看重即时性)

### 方案 C: 预览区样式优化(解决"预览效果差")

**核心思路:**
- 改进预览区的视觉效果
- 调整字体、行高、颜色等
- 让预览更清晰易读

**实现要点:**
1. 调整预览区字体大小为 12px(从11px增加)
2. 调整行高为 1.5(从1.6减少,更紧凑)
3. 优化颜色对比度
4. 移除 `break-words`,改用 `overflow-x: auto` 横向滚动

**关键代码:**
```typescript
// SessionCard.tsx 第527-598行
<div
  className="session-card-preview"
  style={{
    minHeight: 126,
    height: 16 + previewLineCount * 20, // 调整行高
    padding: '10px 12px',
    background: themeBg,
    ['--preview-bg' as any]: themeBg,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 12, // 从11px增加到12px
    lineHeight: 1.5, // 从1.6减少到1.5
    color: themeFg,
    cursor: 'text',
    userSelect: 'text',
    overflowX: 'auto', // 改为横向滚动
    overflowY: 'hidden',
    borderTop: '1px solid var(--ant-color-border)',
    borderBottom: '1px solid var(--ant-color-border)',
    position: 'relative',
  }}
  onDoubleClick={handleFullscreen}
>
  {session.previewText ? (
    <pre
      className="whitespace-pre m-0" // 移除 break-words
      style={{
        minWidth: '100%',
        width: 'fit-content',
      }}
      dangerouslySetInnerHTML={{ __html: previewHtml }}
    />
  ) : (
    <pre className="whitespace-pre m-0" style={{ color: themeFg, opacity: 0.4 }}>等待输出...</pre>
  )}
  {/* ... */}
</div>
```

**预期效果:**
- 字体更大更清晰(12px vs 11px)
- 行高更紧凑(1.5 vs 1.6)
- 横向滚动避免自动换行导致的视觉混乱
- 终端内容保持原始格式

## 四、推荐实施优先级

**第一优先级(立即见效):**
1. **方案 A**: 卡片宽度优化(解决"卡片窄")
2. **方案 B**: 数据流即时更新(解决"展示慢")

**第二优先级(体验提升):**
3. **方案 C**: 预览区样式优化(解决"预览效果差")

## 五、具体实施步骤

### 步骤 1: 卡片宽度优化(方案 A)
- 修改 App.tsx 第686行
- 将 `minmax(400px, 1fr)` 改为 `minmax(500px, 1fr)`
- 测试不同屏幕尺寸下的显示效果

### 步骤 2: 数据流即时更新(方案 B)
- 移除 App.tsx 中的 rafIdRef 相关代码
- 修改 handleOutput 函数,直接调用 flushSession
- 测试按键响应速度

### 步骤 3: 预览区样式优化(方案 C)
- 修改 SessionCard.tsx 的预览区样式
- 调整字体大小、行高、滚动方式
- 测试预览区的视觉效果

### 步骤 4: 验证优化效果
- 构建特性 EXE
- 用户验证体验改善

## 六、预期效果对比

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 卡片最小宽度 | 400px | 500px |
| 首字节延迟 | ~16ms(rAF) | 0ms(即时) |
| 预览字体大小 | 11px | 12px |
| 预览行高 | 1.6 | 1.5 |
| 预览滚动方式 | 纵向滚动+自动换行 | 横向滚动+保持格式 |

## 七、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 卡片宽度过宽导致布局问题 | 使用 `auto-fill` 自适应屏幕宽度 |
| 即时更新导致性能问题 | 如果性能有问题,可以改用 10ms 节流 |
| 横向滚动不符合用户习惯 | 如果用户不喜欢,可以改回纵向滚动 |

## 八、总结

本次优化聚焦于解决用户反馈的核心问题:
1. **卡片变得好窄** → 方案 A(增加最小宽度到 500px)
2. **终端内容展示慢** → 方案 B(移除节流,即时更新)
3. **预览效果差** → 方案 C(优化字体、行高、滚动方式)

通过这三个方案的实施,预期可以显著改善用户体验。
