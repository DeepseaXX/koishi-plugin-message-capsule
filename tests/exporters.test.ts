import assert from 'node:assert/strict'
import test from 'node:test'
import { renderHtml } from '../src/exporters/html'
import { renderJson } from '../src/exporters/json'
import { renderMarkdown } from '../src/exporters/markdown'
import { renderText } from '../src/exporters/text'
import { createExportView } from '../src/exporters/view'
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
    },
    parts: [{ type: 'text', text: '<script>alert(1)</script>' }],
    text: '<script>alert(1)</script>',
    resources: [],
  }],
}

const privateSettings: ExportSettings = {
  messageTemplate: '${用户昵称} ${日期时间}\n${消息内容}',
  includeMessageTime: true,
  includeUserId: false,
  includeGroupNickname: false,
  includeOriginalId: false,
  saveImages: false,
}

test('JSON omits disabled private fields and uses the username fallback', () => {
  const output = renderJson(document, privateSettings)
  assert.doesNotMatch(output, /123456|uid-secret|message-secret|forward-secret|group-secret|群名片/)
  const parsed = JSON.parse(output)
  assert.equal(parsed.messages[0].sender.name, 'QQ昵称')
})

test('TXT includes enabled sender fields when the template asks for them', () => {
  const output = renderText(document, {
    ...privateSettings,
    messageTemplate: '${用户昵称} ${日期时间} ${用户ID} ${原始用户ID} ${消息ID}\n${消息内容}',
    includeUserId: true,
    includeGroupNickname: true,
    includeOriginalId: true,
  })
  assert.match(output, /群名片/)
  assert.match(output, /123456/)
  assert.match(output, /uid-secret/)
  assert.match(output, /message-secret/)
})

test('template fields follow content switches and group nickname fallback', () => {
  const view = createExportView(document, {
    ...privateSettings,
    messageTemplate: '${用户昵称}|${用户名}|${群昵称}|${用户ID}|${原始用户ID}|${消息ID}|${消息内容}',
  })
  assert.equal(view.messages[0].formatted, 'QQ昵称|QQ昵称|||||<script>alert(1)</script>')

  const withGroupName = createExportView(document, {
    ...privateSettings,
    includeGroupNickname: true,
    includeUserId: true,
    includeOriginalId: true,
    messageTemplate: '${用户昵称}|${群昵称}|${用户ID}|${原始用户ID}|${消息ID}',
  })
  assert.equal(withGroupName.messages[0].formatted, '群名片|群名片|123456|uid-secret|message-secret')
})

test('Markdown uses the same formatted message body', () => {
  const output = renderMarkdown(document, privateSettings)
  assert.match(output, /^# 消息胶囊/m)
  assert.match(output, /QQ昵称/)
  assert.match(output, /<script>alert\(1\)<\/script>/)
})

test('HTML escapes message content and never emits remote source URLs', () => {
  const output = renderHtml(document, privateSettings)
  assert.doesNotMatch(output, /<script>alert/)
  assert.match(output, /&lt;script&gt;alert/)
  assert.doesNotMatch(output, /forward-secret|123456/)
})

test('PNG page is kept at the compact width', () => {
  const output = renderHtml(document, privateSettings)
  assert.match(output, /\.archive \{ width: min\(516px, 100%\);/)
})
