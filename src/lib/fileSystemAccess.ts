import { fileOpen } from 'browser-fs-access'

export async function openLogFile(): Promise<File> {
  const file = await fileOpen({
    mimeTypes: ['text/plain', 'application/octet-stream', 'application/gzip', 'application/zip'],
    extensions: ['.log', '.txt', '.gz', '.zip'],
    description: 'Log files',
    multiple: false,
  })
  return file
}
