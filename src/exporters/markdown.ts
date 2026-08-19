import { ExportDocument, ExportSettings } from '../types'
import { createExportView } from './view'

export function renderMarkdown(document: ExportDocument, settings: ExportSettings) {
  const view = createExportView(document, settings)
  const lines = [
    '# 消息胶囊',
    '',
    `- 导出时间：${view.exportedAt}`,
    `- 消息数量：${view.messageCount}`,
    `- 来源平台：${view.source.platform}`,
  ]
  if (view.source.forwardId) lines.push(`- 合并转发 ID：${view.source.forwardId}`)
  lines.push('', '---', '')

  view.messages.forEach((message, index) => {
    lines.push(message.formatted)
    if (index < view.messages.length - 1) lines.push('', '---', '')
  })

  lines.push('', '---')
  return lines.join('\n') + '\n'
}
