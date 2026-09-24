export interface FileEntry {
  name: string
  path: string
  kind: 'file' | 'dir'
  mtimeMs?: number
  sizeBytes?: number
}

export interface WriteResult {
  ok: boolean
  path: string
  sha256: string
}

/**
 * File client for the control service. Paths stay on the service; this class
 * only forwards them. Credentials travel as a same-origin cookie, or as a
 * bearer token when the caller is not a browser page.
 */
export class ServiceFiles {
  constructor(
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async list(path: string): Promise<FileEntry[]> {
    const body = await this.json<{ entries: FileEntry[] }>(
      `/api/files/list?path=${encodeURIComponent(path)}`,
    )
    return body.entries
  }

  async stat(path: string): Promise<FileEntry> {
    return this.json<FileEntry>(`/api/files/stat?path=${encodeURIComponent(path)}`)
  }

  async create(dir: string, name: string): Promise<FileEntry> {
    return this.json<FileEntry>(
      `/api/files/create?dir=${encodeURIComponent(dir)}&name=${encodeURIComponent(name)}`,
      'POST',
    )
  }

  async read(path: string): Promise<Uint8Array> {
    const response = await fetch(
      `${this.baseUrl}/api/files/read?path=${encodeURIComponent(path)}`,
      {
        credentials: 'same-origin',
        headers: this.headers(),
      },
    )
    if (!response.ok) throw new Error(await errorMessage(response))
    return new Uint8Array(await response.arrayBuffer())
  }

  async write(path: string, data: Uint8Array, overwrite: boolean): Promise<WriteResult> {
    const response = await fetch(
      `${this.baseUrl}/api/files/write?path=${encodeURIComponent(path)}&overwrite=${overwrite ? '1' : '0'}`,
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: this.headers(),
        body: data as BufferSource,
      },
    )
    if (!response.ok) throw new Error(await errorMessage(response))
    return (await response.json()) as WriteResult
  }

  private headers(): Headers {
    const headers = new Headers()
    if (this.token) headers.set('authorization', `Bearer ${this.token}`)
    return headers
  }

  private async json<T>(path: string, method = 'GET'): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      credentials: 'same-origin',
      headers: this.headers(),
    })
    if (!response.ok) throw new Error(await errorMessage(response))
    return (await response.json()) as T
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string; message?: string }
    return body.message || body.error || response.statusText
  } catch {
    return response.statusText
  }
}
