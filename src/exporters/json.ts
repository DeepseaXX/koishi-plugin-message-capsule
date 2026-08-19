import { ExportDocument, ExportSettings } from '../types'
import { createExportView } from './view'

export function renderJson(document: ExportDocument, settings: ExportSettings) {
  const view = createExportView(document, settings)
  const output = {
    metadata: {
      generator: 'koishi-plugin-message-capsule',
      version: 1,
      exportedAt: view.exportedAt,
      messageCount: view.messageCount,
    },
    source: view.source,
    exportOptions: settings,
    messages: view.messages.map(message => ({
      index: message.index,
      time: message.time,
      originalId: message.originalId,
      sender: {
        name: message.sender.displayName,
        username: message.sender.username,
        groupNickname: message.sender.groupNickname,
        userId: message.sender.userId,
        originalId: message.sender.originalId,
      },
      content: {
        text: message.text,
        formatted: message.formatted,
        elements: message.parts.map(part => ({
          type: part.type,
          text: part.text,
          path: part.imagePath,
        })),
      },
    })),
  }
  return JSON.stringify(output, null, 2) + '\n'
}
