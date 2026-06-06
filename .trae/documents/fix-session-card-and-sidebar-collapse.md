# 修复计划：会话卡片不显示 + 侧边栏折叠

## 问题分析

### 问题1：创建会话后主页面没有卡片

**根因**：Zustand store 中 `filteredSessions` 是通过 `get` 计算属性实现的（`store/index.ts` L111-127），但 Zustand 的 getter 在 React 组件中**不会触发重新渲染**。`useAppStore()` 只订阅了通过 `set()` 更新的状态，而 `filteredSessions` 作为 getter 每次调用 `get()` 时重新计算，但 React 组件不会因为 getter 返回值变化而重渲染。

具体流程：
1. `NewSessionDialog` 调用 `addSession(session)` → `set()` 更新 `sessions` 数组 ✅
2. `App.tsx` 中 `const { filteredSessions } = useAppStore()` → **不会因 sessions 变化而重渲染**，因为 `filteredSessions` 不是 store 的直接状态字段
3. 结果：卡片数据存在于 store，但 UI 不更新

**修复方案**：将 `filteredSessions` 从 getter 改为 Zustand 的派生状态，使用 selector 在组件中计算，确保 sessions 变化时触发重渲染。

### 问题2：侧边栏不能折叠

**根因**：`Sidebar.tsx` 当前是固定宽度 `w-52`，没有任何折叠/展开逻辑。

**修复方案**：添加折叠状态，折叠时只显示图标，展开时显示完整菜单。

## 修改计划

### 文件1：`src/renderer/src/store/index.ts`
- 删除 `filteredSessions` getter 属性（L38, L111-127）
- 保留 `sessions`、`searchQuery`、`selectedGroupId` 作为直接状态

### 文件2：`src/renderer/src/App.tsx`
- 将 `const { sessions, isFullscreen, filteredSessions } = useAppStore()` 改为使用 selector 订阅
- 在组件内用 `useMemo` 从 `sessions` + `searchQuery` + `selectedGroupId` 派生 `filteredSessions`
- 将 `sidebarCollapsed` 状态提升到 App，传给 Sidebar

### 文件3：`src/renderer/src/components/Sidebar.tsx`
- 新增 `collapsed` / `onToggle` props
- 折叠时宽度变为 `w-14`，只显示图标
- 展开时恢复 `w-52`，显示完整菜单
- 添加折叠/展开切换按钮

## 验证步骤
1. 启动 `npm run dev`
2. 点击新建会话 → 填写信息 → 创建 → 确认卡片出现在主页面
3. 点击侧边栏折叠按钮 → 确认侧边栏收缩为图标模式
4. 再次点击 → 确认侧边栏展开恢复
5. 创建多个会话 → 搜索框过滤 → 确认过滤正常工作
