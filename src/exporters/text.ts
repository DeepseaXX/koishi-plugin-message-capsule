import { ExportDocument, ExportSettings } from '../types'
import { createExportView, ViewMessage } from './view'

function senderLabel(message: ViewMessage) {
  const details: string[] = []
  if (message.sender.userId) details.push(`用户 ID: ${message.sender.userId}`)
  if (message.sender.originalId) details.push(`ID: ${message.sender.originalId}`)
  if (message.originalId) details.push(`消息 ID: ${message.originalId}`)
  return details.length
    ? `${message.sender.displayName} (${details.join('；')})`
    : message.sender.displayName
}

function contentText(message: ViewMessage) {
  return message.parts.map((part) => {
    if (part.type === 'image' && part.imagePath) return `${part.text}(${part.imagePath})`
    return part.text
  }).join('').trim() || '[空消息]'
}

export function renderMessageText(message: ViewMessage) {
  const prefix = [message.time ? `[${message.time}]` : '', senderLabel(message)]
    .filter(Boolean)
    .join(' ')
  return `${prefix}\n${contentText(message)}`
}

export function renderText(document: ExportDocument, settings: ExportSettings) {
  const view = createExportView(document, settings)
  const lines = [
    '消息胶囊',
    `导出时间：${view.exportedAt}`,
    `消息数量：${view.messageCount}`,
    `来源平台：${view.source.platform}`,
  ]
  if (view.source.forwardId) lines.push(`合并转发 ID：${view.source.forwardId}`)
  lines.push('', '========================================', '')

  view.messages.forEach((message, index) => {
    lines.push(renderMessageText(message))
    if (index < view.messages.length - 1) lines.push('', '----------------------------------------', '')
  })

  lines.push('', '========================================')
  lines.push('由 koishi-plugin-message-capsule 生成')
  lines.push('导出格式设计参考并感谢 qq-chat-exporter 原作者：https://github.com/shuakami/qq-chat-exporter')
  return lines.join('\n') + '\n'
}
