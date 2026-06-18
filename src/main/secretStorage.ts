/**
 * 敏感信息安全存储：基于 Electron safeStorage（操作系统级加密）。
 *
 * - Windows：DPAPI（用户态加密，仅当前用户可解）
 * - macOS：Keychain
 * - Linux：libsecret
 *
 * 加密后的密文以 base64 字符串形式持久化到 electron-store（复用 storageManager），
 * 明文绝不落盘。SshConfig 中只保存 secretStorage 的查找 key（passwordRef / passphraseRef）。
 *
 * 注意：safeStorage 仅在 app.whenReady() 后可用，所有方法调用方需确保此约束。
 */

import { safeStorage } from 'electron'
import { createStorageManager } from './storage'

const PREFIX = 'ssh_secret_'

const storageManager = createStorageManager()

export const secretStorage = {
  /**
   * 加密并存储敏感明文。
   * @throws 若系统加密不可用（极罕见，通常发生在未登录用户或容器环境）
   */
  set(key: string, plaintext: string): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('系统加密不可用（safeStorage），无法存储敏感信息')
    }
    const buf = safeStorage.encryptString(plaintext)
    storageManager.set(PREFIX + key, buf.toString('base64'))
  },

  /**
   * 读取并解密。key 不存在或解密失败时返回 undefined。
   */
  get(key: string): string | undefined {
    const b64 = storageManager.get(PREFIX + key) as string | undefined
    if (!b64) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(b64, 'base64'))
    } catch {
      return undefined
    }
  },

  /**
   * 删除指定 key 的密文。key 不存在时静默。
   */
  remove(key: string): void {
    storageManager.delete(PREFIX + key)
  },
}
