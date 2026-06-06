import { useState } from 'react'
import { Menu } from 'antd'
import type { MenuProps } from 'antd'
import { FolderOutlined, PlusOutlined } from '@ant-design/icons'
import { useAppStore } from '../store'

export default function Sidebar() {
  const { groups, selectedGroupId, setSelectedGroupId, addGroup } = useAppStore()
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
    }
  }

  const menuItems: MenuProps['items'] = [
    {
      key: 'all',
      icon: <FolderOutlined />,
      label: '全部会话',
    },
    ...groups.map(group => ({
      key: group.id,
      icon: (
        <span 
          style={{ 
            display: 'inline-block', 
            width: 8, 
            height: 8, 
            borderRadius: '50%', 
            backgroundColor: group.color 
          }} 
        />
      ),
      label: group.name,
    }))
  ]

  const handleMenuClick = (e: { key: string }) => {
    if (e.key === 'all') {
      setSelectedGroupId(null)
    } else {
      setSelectedGroupId(e.key)
    }
  }

  return (
    <div className="w-56 border-r bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <div className="p-3">
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-3">
          分组
        </div>
        <Menu
          mode="inline"
          selectedKeys={selectedGroupId ? [selectedGroupId] : ['all']}
          onClick={handleMenuClick}
          className="border-r-0 bg-transparent dark:bg-transparent"
          items={menuItems}
        />
        
        <div className="mt-3 px-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onPressEnter={handleAddGroup}
              placeholder="新分组名"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddGroup}
              className="px-2 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              <PlusOutlined />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
