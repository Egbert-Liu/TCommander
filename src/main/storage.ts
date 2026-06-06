import Store from 'electron-store'

const store = new Store()

export function createStorageManager() {
  function get(key: string): any {
    return store.get(key)
  }

  function set(key: string, value: any): void {
    store.set(key, value)
  }

  function deleteKey(key: string): void {
    store.delete(key)
  }

  function clear(): void {
    store.clear()
  }

  return {
    get,
    set,
    delete: deleteKey,
    clear
  }
}
