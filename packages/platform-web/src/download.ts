/** Hand bytes to the user as a download. Does not adopt a document ref. */
export async function downloadBytes(
  defaultName: string,
  data: ArrayBuffer,
): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const blob = new Blob([data])
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = defaultName
    link.click()
    URL.revokeObjectURL(url)
    return { ok: true, name: defaultName }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
