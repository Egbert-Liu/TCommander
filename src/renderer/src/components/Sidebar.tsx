import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Folder } from 'lucide-react'
import { useAppStore } from '../store'

export default function Sidebar() {
  const { groups, selectedGroupId, setSelectedGroupId, addGroup } = useAppStore()
  const [isExpanded, setIsExpanded] = useState(true)
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const handleAddGroup = () => {
    if (newGroupName.trim()) {
      const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899']
      addGroup({
        id: `group-${Date.now()}`,
        name: newGroupName,
        color: colors[groups.length % colors.length],
        order: groups.length
      })
      setNewGroupName('')
      setShowAddGroup(false)
    }
  }

  return (
    <div className={`w-64 border-r h-full overflow-auto ${
      useAppStore.getState().darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
    }`}>
      <div className="p-4">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 w-full text-left font-semibold mb-2"
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          分组
        </button>

        {isExpanded && (
          <div className="space-y-1">
            <button
              onClick={() => setSelectedGroupId(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                selectedGroupId === null
                  ? 'bg-primary text-white'
                  : useAppStore.getState().darkMode
                    ? 'hover:bg-gray-700'
                    : 'hover:bg-gray-100'
              }`}
            >
              <Folder className="w-4 h-4" />
              全部会话
            </button>

            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                  selectedGroupId === group.id
                    ? 'bg-primary text-white'
                    : useAppStore.getState().darkMode
                      ? 'hover:bg-gray-700'
                      : 'hover:bg-gray-100'
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                {group.name}
              </button>
            ))}

            {showAddGroup ? (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                  placeholder="分组名称"
                  className={`flex-1 px-2 py-1 text-sm rounded border ${
                    useAppStore.getState().darkMode
                      ? 'bg-gray-700 border-gray-600 text-white'
                      : 'bg-gray-100 border-gray-300'
                  } focus:outline-none focus:ring-1 focus:ring-primary`}
                  autoFocus
                />
                <button
                  onClick={handleAddGroup}
                  className="px-2 py-1 text-sm bg-primary text-white rounded hover:bg-blue-700"
                >
                  添加
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAddGroup(true)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                  useAppStore.getState().darkMode
                    ? 'hover:bg-gray-700 text-gray-400'
                    : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <Plus className="w-4 h-4" />
                添加分组
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
