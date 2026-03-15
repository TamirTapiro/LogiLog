import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Fixture path for a sample log file used by ingestion tests
const SAMPLE_LOG = path.join(__dirname, 'fixtures', 'sample.txt')

// ---------------------------------------------------------------------------
// Flow 1: App loads and basic shell is visible
// ---------------------------------------------------------------------------

test('app loads and renders the LogiLog shell', async ({ page }) => {
  await page.goto('/')

  // The sidebar wordmark should be visible
  await expect(page.getByText('LogiLog').first()).toBeVisible()

  // Page title should be the default
  await expect(page).toHaveTitle(/LogiLog/)
})

test('sidebar navigation items are present', async ({ page }) => {
  await page.goto('/')

  // All four nav items should be rendered
  await expect(page.getByRole('button', { name: /Timeline/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Log Viewer/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Clusters/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Anomalies/i })).toBeVisible()
})

test('sidebar collapse button is present and accessible', async ({ page }) => {
  await page.goto('/')

  const collapseBtn = page.getByRole('button', { name: /collapse sidebar/i })
  await expect(collapseBtn).toBeVisible()
})

test('keyboard shortcuts modal opens with ? key', async ({ page }) => {
  await page.goto('/')

  // Click to ensure the page has focus before sending keyboard events
  await page.locator('body').click()
  await page.keyboard.press('?')
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).toBeVisible()

  // Close with Escape
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: /keyboard shortcuts/i })).not.toBeVisible()
})

// ---------------------------------------------------------------------------
// Flow 2: File ingestion flow
// Requires FileDropZone to be wired into App rendering.
// ---------------------------------------------------------------------------

test.fixme('file ingestion flow: drop a log file and entries appear in log list', async ({
  page,
}) => {
  await page.goto('/')

  // The drop zone should be visible on first load
  const dropZone = page.getByRole('button', { name: /drop log file/i })
  await expect(dropZone).toBeVisible()

  // Upload the fixture file via the file input or drag-and-drop
  const fileChooserPromise = page.waitForEvent('filechooser')
  await dropZone.click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_LOG)

  // After ingestion, the log viewer should show entries
  const logList = page.getByRole('log', { name: /log entries/i })
  await expect(logList).toBeVisible({ timeout: 10000 })

  // At least one log row should be present
  await expect(logList.locator('[class*="logRow"]').first()).toBeVisible()

  // Document title should update to include the filename
  await expect(page).toHaveTitle(/sample\.log/)
})

// ---------------------------------------------------------------------------
// Flow 3: Timeline interaction
// Requires Timeline component to be wired into App rendering.
// ---------------------------------------------------------------------------

test.fixme('timeline interaction: clicking a timeline bar filters the log list', async ({
  page,
}) => {
  await page.goto('/')

  // First ingest a file
  const dropZone = page.getByRole('button', { name: /drop log file/i })
  await dropZone.click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_LOG)

  // Navigate to Timeline panel
  await page.getByRole('button', { name: /Timeline/i }).click()

  // The timeline chart container should be visible
  const chart = page.getByRole('img', { name: /log timeline chart/i })
  await expect(chart).toBeVisible({ timeout: 10000 })

  // Click on a bar in the chart — this scrolls the log list to the matching time bucket
  const firstBar = chart.locator('.recharts-bar-rectangle').first()
  await firstBar.click()

  // After clicking, the log viewer should show entries near that time bucket
  await page.getByRole('button', { name: /Log Viewer/i }).click()
  const logList = page.getByRole('log', { name: /log entries/i })
  await expect(logList).toBeVisible()
})

// ---------------------------------------------------------------------------
// Flow 4: Clustering flow
// Requires full ML inference pipeline (WebGPU + Transformers.js).
// Skipped in CI — needs actual WebGPU stack.
// ---------------------------------------------------------------------------

test.fixme('clustering flow: wait for clustering to complete and clusters appear in analysis panel', async ({
  page,
}) => {
  await page.goto('/')

  // Ingest a file to trigger analysis
  const dropZone = page.getByRole('button', { name: /drop log file/i })
  await dropZone.click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_LOG)

  // Navigate to Clusters panel
  await page.getByRole('button', { name: /Clusters/i }).click()

  // Wait for clustering to complete (may take a while for ML inference)
  await expect(page.getByRole('button', { name: /cluster/i }).first()).toBeVisible({
    timeout: 60000,
  })
})

// ---------------------------------------------------------------------------
// Flow 5: Anomaly flow
// Requires full ML inference pipeline (WebGPU + Transformers.js).
// Skipped in CI — needs actual WebGPU stack.
// ---------------------------------------------------------------------------

test.fixme('anomaly flow: wait for anomaly scoring and anomaly list shows entries with scores', async ({
  page,
}) => {
  await page.goto('/')

  // Ingest a file to trigger analysis
  const dropZone = page.getByRole('button', { name: /drop log file/i })
  await dropZone.click()
  const fileChooserPromise = page.waitForEvent('filechooser')
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(SAMPLE_LOG)

  // Navigate to Anomalies panel
  await page.getByRole('button', { name: /Anomalies/i }).click()

  // Wait for anomaly scoring to complete
  // The anomaly list should show cards with scores
  const anomalyList = page.locator('[class*="listWrapper"]')
  await expect(anomalyList).toBeVisible({ timeout: 60000 })

  // At least one anomaly card should be present
  await expect(page.locator('[class*="card"]').first()).toBeVisible()
})
