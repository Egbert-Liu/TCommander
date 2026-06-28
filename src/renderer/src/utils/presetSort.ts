import { Preset } from '../types'

/**
 * 按优先级和使用次数排序预设
 * 优先级高的在前，优先级相同则使用次数多的在前
 */
export function sortPresets(presets: Preset[]): Preset[] {
  return [...presets].sort((a, b) => {
    // 先按优先级排序（降序）
    const priorityDiff = (b.priority || 0) - (a.priority || 0)
    if (priorityDiff !== 0) return priorityDiff
    
    // 优先级相同，按使用次数排序（降序）
    return (b.usageCount || 0) - (a.usageCount || 0)
  })
}
