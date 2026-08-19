import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { renderScreenshot, ScreenshotServiceError } from '../src/exporters/image'

test('PNG renderer uses the optional Puppeteer service and writes its result', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qfe-image-test-'))
  const output = path.join(directory, 'output.png')
  let closed = false
  try {
    const context = {
      puppeteer: {
        async page() {
          return {
            async setViewport() {},
            async setContent() {},
            async evaluate() {},
            async $() {
              return { async screenshot() { return Buffer.from('fake-png') } }
            },
            async close() { closed = true },
          }
        },
      },
    }
    await renderScreenshot(context as never, '<main class="archive"></main>', output, 900, 1)
    assert.equal((await readFile(output)).toString(), 'fake-png')
    assert.equal(closed, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('PNG renderer reports a missing Puppeteer service', async () => {
  await assert.rejects(
    renderScreenshot({} as never, '<main class="archive"></main>', 'unused.png', 900, 1),
    ScreenshotServiceError,
  )
})
