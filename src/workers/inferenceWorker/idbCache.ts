export interface CacheMeta {
  sizeBytes: number
  downloadedAt: number
  sha256: string
  transformersVersion: string
}

interface CacheEntry {
  key: string
  data: ArrayBuffer
  meta: CacheMeta
}

const DB_NAME = 'LogiLog-model-cache'
const STORE_NAME = 'model-files'
const DB_VERSION = 1

export class IDBModelCache {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    if (this.db) return
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' })
        }
        // Clean up any orphaned entries on version bump would go here
      }

      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    await this.open()
    const entry = await this._get(key)
    if (!entry) return null

    // SHA-256 integrity check
    const computed = await sha256Hex(entry.data)
    if (computed !== entry.meta.sha256) {
      // Corrupt entry — delete and return null
      await this.delete(key)
      return null
    }

    return entry.data
  }

  async set(key: string, data: ArrayBuffer, meta: CacheMeta): Promise<void> {
    await this.open()
    const entry: CacheEntry = { key, data, meta }
    await this._put(entry)
  }

  async has(key: string): Promise<boolean> {
    await this.open()
    const db = this.db!
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.count(key)
      req.onsuccess = () => resolve(req.result > 0)
      req.onerror = () => reject(req.error)
    })
  }

  async delete(key: string): Promise<void> {
    await this.open()
    const db = this.db!
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  async clear(): Promise<void> {
    await this.open()
    const db = this.db!
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.clear()
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }

  private _get(key: string): Promise<CacheEntry | null> {
    const db = this.db!
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null)
      req.onerror = () => reject(req.error)
    })
  }

  private _put(entry: CacheEntry): Promise<void> {
    const db = this.db!
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  }
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
