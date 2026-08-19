import { pathToFileURL } from 'node:url'
import { ExportDocument, ExportMessage, ExportResource, ExportSettings, MessagePart } from '../types'

export type AssetMode = 'relative' | 'file-url'

export interface ViewSender {
  displayName: string
  username?: string
  groupNickname?: string
  userId?: string
  originalId?: string
  avatar?: string
}

export interface ViewPart {
  type: MessagePart['type']
  text: string
  image?: string
  imagePath?: string
}

export interface ViewMessage {
  index: number
  time?: string
  originalId?: string
  sender: ViewSender
  parts: ViewPart[]
  text: string
  formatted: string
}

export interface ExportView {
  exportedAt: string
  messageCount: number
  source: {
    platform: string
    forwardId?: string
    guildId?: string
    channelId?: string
  }
  messages: ViewMessage[]
}

export function formatDateTime(timestamp: number) {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function senderKey(message: ExportMessage) {
  return message.sender.originalId
    ?? message.sender.userId
    ?? message.sender.groupNickname
    ?? message.sender.nickname
    ?? `message:${message.index}`
}

function resourcePath(resource: ExportResource, mode: AssetMode) {
  if (mode === 'file-url' && resource.absolutePath) return pathToFileURL(resource.absolutePath).href
  return resource.localPath?.replace(/\\/g, '/')
}

function contentText(message: ExportMessage) {
  return message.parts.map((part) => {
    if (part.type === 'image' && part.resource?.localPath) {
      return `${part.text}(${part.resource.localPath.replace(/\\/g, '/')})`
    }
    return part.text
  }).join('').trim() || '[空消息]'
}

function renderMessageTemplate(
  template: string,
  message: ViewMessage,
  document: ExportDocument,
) {
  const imagePaths = message.parts
    .map(part => part.imagePath)
    .filter(Boolean)
    .join('\n')
  const values: Record<string, string> = {
    '${用户昵称}': message.sender.displayName,
    '${用户名}': message.sender.username || '',
    '${群昵称}': message.sender.groupNickname || '',
    '${用户ID}': message.sender.userId || '',
    '${原始用户ID}': message.sender.originalId || '',
    '${消息ID}': message.originalId || '',
    '${原始消息ID}': message.originalId || '',
    '${日期时间}': message.time || '',
    '${消息内容}': message.text,
    '${图片}': imagePaths,
    '${头像}': message.sender.avatar || '',
    '${序号}': String(message.index),
    '${平台}': document.source.platform,
  }
  const source = template.trim() || '${用户昵称} ${日期时间}\n${消息内容}'
  return source.replace(/\$\{[^}]+\}/g, token => values[token] ?? token).trim()
}

export function createExportView(
  document: ExportDocument,
  settings: ExportSettings,
  assetMode: AssetMode = 'relative',
): ExportView {
  const aliases = new Map<string, string>()

  const getAlias = (message: ExportMessage) => {
    const key = senderKey(message)
    let alias = aliases.get(key)
    if (!alias) {
      alias = `用户${aliases.size + 1}`
      aliases.set(key, alias)
    }
    return alias
  }

  return {
    exportedAt: document.exportedAt,
    messageCount: document.messages.length,
    source: {
      platform: document.source.platform,
      forwardId: settings.includeOriginalId ? document.source.forwardId : undefined,
      guildId: settings.includeOriginalId ? document.source.guildId : undefined,
      channelId: settings.includeOriginalId ? document.source.channelId : undefined,
    },
    messages: document.messages.map((message) => {
      const username = message.sender.nickname
      const preferredName = settings.includeGroupNickname
        ? message.sender.groupNickname ?? username
        : username
      const avatar = settings.includeAvatar
        ? assetMode === 'file-url' && message.sender.avatarAbsolutePath
          ? pathToFileURL(message.sender.avatarAbsolutePath).href
          : message.sender.avatarPath?.replace(/\\/g, '/')
        : undefined

      const viewMessage: ViewMessage = {
        index: message.index,
        time: settings.includeMessageTime && message.timestamp
          ? formatDateTime(message.timestamp)
          : undefined,
        originalId: settings.includeOriginalId ? message.originalId : undefined,
        sender: {
          displayName: preferredName || getAlias(message),
          username,
          groupNickname: settings.includeGroupNickname ? message.sender.groupNickname : undefined,
          userId: settings.includeUserId ? message.sender.userId : undefined,
          originalId: settings.includeOriginalId ? message.sender.originalId : undefined,
          avatar,
        },
        parts: message.parts.map(part => ({
          type: part.type,
          text: part.text,
          image: settings.saveImages && part.resource ? resourcePath(part.resource, assetMode) : undefined,
          imagePath: settings.saveImages ? part.resource?.localPath?.replace(/\\/g, '/') : undefined,
        })),
        text: contentText({ ...message, parts: message.parts.map(part => ({
          ...part,
          resource: settings.saveImages ? part.resource : undefined,
        })) }),
        formatted: '',
      }
      viewMessage.formatted = renderMessageTemplate(settings.messageTemplate, viewMessage, document)
      return viewMessage
    }),
  }
}
