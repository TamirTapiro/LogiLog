import { fileSave } from 'browser-fs-access'

export async function exportToJson(data: unknown, filename: string): Promise<void> {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  await fileSave(blob, {
    fileName: filename,
    extensions: ['.json'],
  })
}

export async function exportToCsv(
  rows: Record<string, unknown>[],
  headers: string[],
  filename: string,
): Promise<void> {
  const escape = (val: unknown): string => {
    const str = val == null ? '' : String(val)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ]
  const csv = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  await fileSave(blob, {
    fileName: filename,
    extensions: ['.csv'],
  })
}
