import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const SAMPLE_LOG = path.join(process.cwd(), 'e2e', 'fixtures', 'sample.txt')

// ---------------------------------------------------------------------------
// Drag-and-drop file ingestion tests
// ---------------------------------------------------------------------------

test('drop zone is visible on first load', async ({ page }) => {
  await page.goto('/')

  const dropZone = page.getByRole('button', { name: /drop log file or click to browse/i })
  await expect(dropZone).toBeVisible()
  await expect(dropZone).toContainText('Drop log file here')
  await expect(dropZone).toContainText('or click to browse')
})

test('drop zone shows dragOver visual state on dragenter', async ({ page }) => {
  await page.goto('/')

  const dropZone = page.getByRole('button', { name: /drop log file or click to browse/i })
  await expect(dropZone).toBeVisible()

  // Dispatch dragenter — component calls handleDragOver which sets isDragOver=true
  await dropZone.dispatchEvent('dragenter')
  await dropZone.dispatchEvent('dragover')

  // The dragOver CSS module class should be applied
  await expect(dropZone).toHaveClass(/dragOver/)
})

test('drop zone removes dragOver state on dragleave', async ({ page }) => {
  await page.goto('/')

  const dropZone = page.getByRole('button', { name: /drop log file or click to browse/i })

  await dropZone.dispatchEvent('dragenter')
  await dropZone.dispatchEvent('dragover')
  await expect(dropZone).toHaveClass(/dragOver/)

  await dropZone.dispatchEvent('dragleave')
  await expect(dropZone).not.toHaveClass(/dragOver/)
})

test('dropping a log file ingests entries into the log viewer', async ({ page }) => {
  await page.goto('/')

  const dropZone = page.getByRole('button', { name: /drop log file or click to browse/i })
  await expect(dropZone).toBeVisible()

  // Build a DataTransfer with the fixture file inside the browser context
  const fileBuffer = fs.readFileSync(SAMPLE_LOG)
  const dataTransfer = await page.evaluateHandle(
    ({ buffer, name }: { buffer: number[]; name: string }) => {
      const dt = new DataTransfer()
      const file = new File([new Uint8Array(buffer)], name, { type: 'text/plain' })
      dt.items.add(file)
      return dt
    },
    { buffer: Array.from(fileBuffer), name: 'sample.txt' },
  )

  // Simulate the full drag sequence
  await dropZone.dispatchEvent('dragenter', { dataTransfer })
  await dropZone.dispatchEvent('dragover', { dataTransfer })
  await expect(dropZone).toHaveClass(/dragOver/)

  await dropZone.dispatchEvent('drop', { dataTransfer })

  // Drop zone should disappear once ingestion starts (status !== 'idle')
  await expect(dropZone).not.toBeVisible({ timeout: 5000 })

  // Navigate to the Log Viewer panel (default panel after ingestion is timeline)
  await page.getByRole('button', { name: /log viewer/i }).click()

  // Log viewer should appear with entries
  const logList = page.getByRole('log', { name: /log entries/i })
  await expect(logList).toBeVisible({ timeout: 10000 })

  // At least one log row should be rendered (LogRow uses role="row")
  await expect(logList.locator('[role="row"]').first()).toBeVisible({ timeout: 10000 })
})

test('drop zone is keyboard accessible (tab focus)', async ({ page }) => {
  await page.goto('/')

  const dropZone = page.getByRole('button', { name: /drop log file or click to browse/i })
  await expect(dropZone).toBeVisible()

  // The drop zone has tabIndex={0} — programmatically focus it and confirm it accepts focus
  await dropZone.focus()
  await expect(dropZone).toBeFocused()
})
