import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { saveResources } from '../src/resources'
import type { Config } from '../src/config'
import type { ExportDocument, ExportSettings } from '../src/types'

test('resource saver writes explicitly enabled data images', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'qfe-resource-test-'))
  try {
    const resource = { type: 'image' as const, sourceUrl: 'data:image/png;base64,aGVsbG8=' }
    const document: ExportDocument = {
      exportedAt: new Date(0).toISOString(),
      source: { platform: 'onebot' },
      messages: [{
        index: 1,
        sender: {},
        parts: [{ type: 'image', text: '[图片]', resource }],
        text: '[图片]',
        resources: [resource],
      }],
    }
    const settings: ExportSettings = {
      messageTemplate: '${用户昵称} ${日期时间}\\n${消息内容}',
      saveImages: true,
      includeAvatar: false,
      includeMessageTime: true,
      includeUserId: false,
      includeGroupNickname: true,
      includeOriginalId: false,
    }
    const config = {
      maxImages: 10,
      maxImageSizeMB: 1,
      maxTotalImageSizeMB: 2,
      imageTimeoutSeconds: 5,
    } as Config
    const result = await saveResources({} as never, document, workspace, settings, config)
    assert.equal(result.savedImages, 1)
    assert.equal(resource.localPath, 'assets/image-0001.png')
    assert.equal((await readFile(resource.absolutePath!)).toString(), 'hello')
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
