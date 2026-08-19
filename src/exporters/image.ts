import { writeFile } from 'node:fs/promises'
import { Context } from 'koishi'

interface PuppeteerPage {
  setViewport(options: { width: number, height: number, deviceScaleFactor: number }): Promise<void>
  setContent(html: string, options?: unknown): Promise<void>
  evaluate<T>(callback: () => T | Promise<T>): Promise<T>
  $(selector: string): Promise<{ screenshot(options?: unknown): Promise<Uint8Array> } | null>
  close(): Promise<void>
}

interface PuppeteerService {
  page(): Promise<PuppeteerPage>
}

export class ScreenshotServiceError extends Error {}

export async function renderScreenshot(
  ctx: Context,
  html: string,
  outputPath: string,
  width: number,
  scale: number,
) {
  const service = (ctx as unknown as { puppeteer?: PuppeteerService }).puppeteer
  if (!service?.page) {
    throw new ScreenshotServiceError('puppeteer service is unavailable')
  }

  const page = await service.page()
  try {
    await page.setViewport({ width, height: 800, deviceScaleFactor: scale })
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(async () => {
      await document.fonts?.ready
    })
    const archive = await page.$('.archive')
    if (!archive) throw new Error('HTML archive root was not rendered')
    const image = await archive.screenshot({ type: 'png' })
    await writeFile(outputPath, image)
  } finally {
    await page.close()
  }
}
