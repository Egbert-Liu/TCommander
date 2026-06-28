# TCommander v0.8.0 - SSH 远程终端集成

## 新增功能

### SSH 远程终端支持
- **TerminalBackend 抽象层**：统一的终端后端接口，支持本地 PTY 和远程 SSH
- **SSH 连接**：支持密码、私钥、keyboard-interactive 三种认证方式
- **安全存储**：使用 Electron safeStorage 加密存储敏感信息（Windows DPAPI / macOS Keychain）
- **连接状态反馈**：实时显示连接状态（connecting/ready/error）
- **SSH 预设管理**：保存 SSH 连接配置，一键快速连接
- **断线重连**：复用已存储的凭证，无需重新输入密码

### 用户体验优化
- 卡片显示 SSH 连接信息（user@host:port）
- 新建会话对话框支持本地/SSH 切换
- 预设管理支持 SSH 配置编辑
- 交互式认证弹窗（keyboard-interactive 支持）

## 技术架构

### 后端抽象
```
TerminalBackend { onData, onExit, write, resize, kill }
├── LocalPtyBackend  (node-pty)
└── SshBackend       (ssh2 Client.shell)
```

### 安全链路
明文密码/口令 → Electron safeStorage 加密 → base64 密文存储
配置中仅保留查找引用（passwordRef / passphraseRef）

### IPC 通道
- `secret-set/get/remove`：安全存储操作
- `ssh-auth-prompt/reply`：交互式认证请求-响应
- `session-conn-status`：连接状态推送

## 依赖更新
- 新增 `ssh2@1.17.0`：SSH 协议实现
- 新增 `@types/ssh2`：TypeScript 类型定义

## 已知限制
- `hostVerifier` 在 ssh2 中是同步回调，无法等待异步用户确认
- 当前 `accept` 策略简化为直接信任（代码注释中有说明）
- 真正的 TOFU 弹窗需要改用 ssh2 的 `hostVerifier` 异步变体或预处理 known_hosts

## 文件变更统计
- 21 个文件修改
- +2209 行新增代码
- -171 行删除代码

## 升级说明
从 v0.5.0 升级，无破坏性变更。本地终端功能保持不变，新增 SSH 远程终端功能。
