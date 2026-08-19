import assert from 'node:assert/strict'
import test from 'node:test'
import { renderHtml } from '../src/exporters/html'
import { renderJson } from '../src/exporters/json'
import { renderText } from '../src/exporters/text'
import type { ExportDocument, ExportSettings } from '../src/types'

const document: ExportDocument = {
  exportedAt: '2026-08-19T03:00:00.000Z',
  source: { platform: 'onebot', forwardId: 'forward-secret', guildId: 'group-secret', channelId: 'channel-secret' },
  messages: [{
    index: 1,
    timestamp: 1_700_000_000_000,
    originalId: 'message-secret',
    sender: {
      nickname: 'QQ昵称',
      groupNickname: '群名片',
      userId: '123456',
      originalId: 'uid-secret',
      avatarPath: 'assets/avatar.png',
      avatarAbsolutePath: 'D:/tmp/avatar.png',
    },
    parts: [{ type: 'text', text: '<script>alert(1)</script>' }],
    text: '<script>alert(1)</script>',
    resources: [],
  }],
}

const privateSettings: ExportSettings = {
  includeMessageTime: true,
  includeUserId: false,
  includeGroupNickname: false,
  includeOriginalId: false,
  includeAvatar: false,
  saveImages: false,
}

test('JSON omits disabled private fields', () => {
  const output = renderJson(document, privateSettings)
  assert.doesNotMatch(output, /123456|uid-secret|message-secret|forward-secret|group-secret|群名片/)
  const parsed = JSON.parse(output)
  assert.equal(parsed.messages[0].sender.name, '用户1')
})

test('TXT includes enabled sender fields', () => {
  const output = renderText(document, {
    ...privateSettings,
  includeUserId: true,
    includeGroupNickname: true,
    includeOriginalId: true,
  })
  assert.match(output, /群名片/)
  assert.match(output, /用户 ID: 123456/)
  assert.match(output, /消息 ID: message-secret/)
})

test('HTML escapes message content and never emits remote source URLs', () => {
  const output = renderHtml(document, privateSettings)
  assert.doesNotMatch(output, /<script>alert/)
  assert.match(output, /&lt;script&gt;alert/)
  assert.doesNotMatch(output, /forward-secret|123456/)
})
