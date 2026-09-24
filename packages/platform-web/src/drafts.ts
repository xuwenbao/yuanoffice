const DB = 'genoffice-drafts'
const STORE = 'drafts'

export interface DraftRecord {
  path: string
  updatedAt: number
  bytes: ArrayBuffer
}

/** Crash drafts. A draft is not a save: the file on disk is unchanged until save_document. */
export class DraftStore {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async put(record: DraftRecord): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(record, record.path)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }

  async get(path: string): Promise<DraftRecord | null> {
    const db = await this.open()
    const record = await new Promise<DraftRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).get(path)
      request.onsuccess = () => resolve((request.result as DraftRecord | undefined) ?? null)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return record
  }

  async list(): Promise<DraftRecord[]> {
    const db = await this.open()
    const records = await new Promise<DraftRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const request = tx.objectStore(STORE).getAll()
      request.onsuccess = () => resolve((request.result as DraftRecord[] | undefined) ?? [])
      request.onerror = () => reject(request.error)
    })
    db.close()
    return records
  }

  async delete(path: string): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(path)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }
}
