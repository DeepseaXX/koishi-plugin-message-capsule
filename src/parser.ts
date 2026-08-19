import { h } from 'koishi'
import { ExportMessage, ExportResource, MessagePart, SenderInfo } from './types'
import { OneBotInternal } from './onebot'

type UnknownRecord = Record<string, unknown>

interface ElementLike {
  type: string
  attrs?: UnknownRecord
  data?: UnknownRecord
  children?: unknown[]
}

interface ForwardReference {
  id?: string
  inlineNodes?: unknown[]
}

interface NormalizedNode {
  message: Omit<ExportMessage, 'index'>
  nestedIds: string[]
}

export type ForwardParseErrorCode = 'no-quote' | 'not-forward' | 'unsupported' | 'empty' | 'limit'

export class ForwardParseError extends Error {
  constructor(public code: ForwardParseErrorCode, message: string) {
    super(message)
    this.name = 'ForwardParseError'
  }
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {}
}

function asElement(value: unknown): ElementLike | undefined {
  const record = asRecord(value)
  return typeof record.type === 'string' ? record as unknown as ElementLike : undefined
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) value = numeric
    else {
      const parsed = Date.parse(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function unescapeCq(value: string) {
  return value
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#44;/g, ',')
    .replace(/&amp;/g, '&')
}

export function parseCqString(source: string): ElementLike[] {
  const output: ElementLike[] = []
  const pattern = /\[CQ:(\w+)((?:,\w+=[^,\]]*)*)\]/g
  let cursor = 0
  let capture: RegExpExecArray | null

  while ((capture = pattern.exec(source))) {
    if (capture.index > cursor) {
      output.push({ type: 'text', data: { text: unescapeCq(source.slice(cursor, capture.index)) } })
    }
    const data: UnknownRecord = {}
    const attributes = capture[2]
    if (attributes) {
      for (const field of attributes.slice(1).split(',')) {
        const index = field.indexOf('=')
        if (index < 0) continue
        data[field.slice(0, index)] = unescapeCq(field.slice(index + 1))
      }
    }
    output.push({ type: capture[1], data })
    cursor = capture.index + capture[0].length
  }

  if (cursor < source.length) {
    output.push({ type: 'text', data: { text: unescapeCq(source.slice(cursor)) } })
  }
  return output
}

function toSegments(content: unknown): unknown[] {
  if (typeof content === 'string') return parseCqString(content)
  if (Array.isArray(content)) return content
  const record = asRecord(content)
  if (Array.isArray(record.elements)) return record.elements
  if (typeof record.type === 'string') return [content]
  if (content == null) return []
  return [{ type: 'text', data: { text: String(content) } }]
}

function allowedResourceUrl(value: unknown) {
  if (typeof value !== 'string') return
  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value
}

function resourceName(value: unknown) {
  if (typeof value !== 'string' || !value) return
  const clean = value.split(/[?#]/, 1)[0].replace(/\\/g, '/')
  return clean.slice(clean.lastIndexOf('/') + 1) || undefined
}

function segmentData(segment: ElementLike) {
  return asRecord(segment.data ?? segment.attrs)
}

function textPart(text: string, type: MessagePart['type'] = 'text'): MessagePart {
  return { type, text }
}

function parseParts(content: unknown): { parts: MessagePart[], resources: ExportResource[], nestedIds: string[] } {
  const parts: MessagePart[] = []
  const resources: ExportResource[] = []
  const nestedIds: string[] = []

  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      parts.push(textPart(value))
      return
    }
    const segment = asElement(value)
    if (!segment) return
    const type = segment.type.toLowerCase()
    const data = segmentData(segment)
    const children = Array.isArray(segment.children) ? segment.children : []

    if (type === 'text') {
      parts.push(textPart(firstString(data.text, data.content) ?? ''))
    } else if (type === 'br') {
      parts.push(textPart('\n'))
    } else if (type === 'image' || type === 'img') {
      const resource: ExportResource = {
        type: 'image',
        sourceUrl: allowedResourceUrl(data.url) ?? allowedResourceUrl(data.src) ?? allowedResourceUrl(data.file),
        originalName: resourceName(data.file) ?? resourceName(data.url) ?? resourceName(data.src),
      }
      resources.push(resource)
      parts.push({ type: 'image', text: '[图片]', resource })
    } else if (type === 'at' || type === 'mention') {
      const target = firstString(data.name, data.qq, data.id)
      parts.push(textPart(data.type === 'all' || data.qq === 'all' ? '@全体成员' : `@${target ?? '用户'}`, 'mention'))
    } else if (type === 'face' || type === 'emoji') {
      const name = firstString(data.name, data.id)
      parts.push(textPart(name ? `[表情:${name}]` : '[表情]', 'emoji'))
    } else if (type === 'record' || type === 'audio') {
      parts.push(textPart('[语音]', 'placeholder'))
    } else if (type === 'video') {
      parts.push(textPart('[视频]', 'placeholder'))
    } else if (type === 'file') {
      const name = firstString(data.name, data.file)
      parts.push(textPart(name ? `[文件:${resourceName(name) ?? name}]` : '[文件]', 'placeholder'))
    } else if (type === 'reply' || type === 'quote') {
      parts.push(textPart('[回复消息]', 'placeholder'))
    } else if (type === 'forward') {
      const id = firstString(data.id, data.resid, data.mResid, data.m_resid, data.messageId, data.message_id)
      if (id) nestedIds.push(id)
      parts.push(textPart('[嵌套合并转发]', 'placeholder'))
    } else if (type === 'json' || type === 'xml' || type.endsWith(':json') || type.endsWith(':xml')) {
      parts.push(textPart('[卡片消息]', 'placeholder'))
    } else if (type === 'location') {
      parts.push(textPart('[位置]', 'placeholder'))
    } else if (type === 'node') {
      for (const child of toSegments(data.content ?? data.message)) visit(child)
    } else if (children.length) {
      children.forEach(visit)
    } else {
      parts.push(textPart(`[${segment.type}消息]`, 'placeholder'))
    }
  }

  toSegments(content).forEach(visit)
  return { parts, resources, nestedIds }
}

function elementNode(element: ElementLike) {
  const attrs = asRecord(element.attrs ?? element.data)
  const author = (element.children ?? []).map(asElement).find(child => child?.type === 'author')
  const authorAttrs = asRecord(author?.attrs ?? author?.data)
  const content = (element.children ?? []).filter(child => asElement(child)?.type !== 'author')
  return {
    sender: {
      user_id: firstString(authorAttrs.id, attrs.userId, attrs.user_id),
      uid: firstString(authorAttrs.uid, attrs.id),
      nickname: firstString(authorAttrs.name, attrs.nickname, attrs.username, attrs.name),
      card: firstString(attrs.nickname),
      avatar: firstString(authorAttrs.avatar, attrs.avatar),
    },
    time: authorAttrs.time ?? attrs.time,
    message_id: attrs.id,
    content,
  }
}

function findForwardReference(elements: unknown[]): ForwardReference {
  let id: string | undefined
  let inlineNodes: unknown[] | undefined

  const visit = (value: unknown) => {
    const element = asElement(value)
    if (!element) return
    const attrs = asRecord(element.attrs ?? element.data)
    const type = element.type.toLowerCase()

    if (type === 'forward') {
      id ??= firstString(attrs.id, attrs.resid, attrs.mResid, attrs.m_resid, attrs.messageId, attrs.message_id)
    }

    if ((type === 'message' && (attrs.forward === true || attrs.forward === 'true')) || type === 'figure') {
      const nodes = (element.children ?? []).map(asElement).filter(Boolean) as ElementLike[]
      if (nodes.length) inlineNodes ??= nodes.map(elementNode)
    }

    for (const child of element.children ?? []) visit(child)
  }

  elements.forEach(visit)
  return { id, inlineNodes }
}

function unwrapPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  const record = asRecord(payload)
  if (record.sender || record.time || record.message_id || record.messageId) return [payload]
  if (Array.isArray(record.messages)) return record.messages
  if (Array.isArray(record.message)) return record.message
  const data = asRecord(record.data)
  if (Array.isArray(data.messages)) return data.messages
  if (Array.isArray(data.message)) return data.message
  return payload == null ? [] : [payload]
}

function senderInfo(sender: UnknownRecord, body: UnknownRecord): SenderInfo {
  const userId = firstString(sender.user_id, sender.uin, body.uin, body.user_id)
  return {
    nickname: firstString(sender.nickname, sender.name, body.nickname, body.name),
    groupNickname: firstString(sender.card, body.card),
    userId,
    originalId: firstString(sender.uid, sender.tiny_id, sender.openid, sender.id, body.uid),
    avatarUrl: firstString(sender.avatar, sender.avatar_url, body.avatar, body.avatar_url),
  }
}

export interface ForwardParserOptions {
  maxMessages: number
  maxDepth: number
}

export class ForwardParser {
  private seen = new Set<string>()
  private output: ExportMessage[] = []

  constructor(private internal: OneBotInternal | undefined, private options: ForwardParserOptions) {}

  async parseQuote(quote?: { elements?: unknown[], content?: string }) {
    if (!quote) throw new ForwardParseError('no-quote', 'command message has no quote')
    const elements = quote.elements?.length ? quote.elements : h.parse(quote.content ?? '')
    const reference = findForwardReference(elements)
    if (!reference.id && !reference.inlineNodes?.length) {
      throw new ForwardParseError('not-forward', 'quoted message is not a merged-forward message')
    }

    if (reference.inlineNodes?.length) {
      await this.appendPayload(reference.inlineNodes, 0)
    } else if (reference.id) {
      await this.fetchForward(reference.id, 0)
    }

    if (!this.output.length) throw new ForwardParseError('empty', 'merged-forward message contains no nodes')
    return { forwardId: reference.id, messages: this.output }
  }

  private async fetchForward(id: string, depth: number) {
    if (depth > this.options.maxDepth || this.seen.has(id)) return
    if (!this.internal) {
      throw new ForwardParseError('unsupported', 'adapter does not expose getForwardMsg')
    }
    this.seen.add(id)
    const payload = await this.internal.getForwardMsg(id)
    await this.appendPayload(payload, depth)
  }

  private async appendPayload(payload: unknown, depth: number) {
    for (const raw of unwrapPayload(payload)) {
      if (this.output.length >= this.options.maxMessages) {
        throw new ForwardParseError('limit', `merged-forward message exceeds ${this.options.maxMessages} nodes`)
      }
      const normalized = await this.normalizeNode(raw)
      this.output.push({ index: this.output.length + 1, ...normalized.message })
      for (const nestedId of normalized.nestedIds) {
        await this.fetchForward(nestedId, depth + 1)
      }
    }
  }

  private async normalizeNode(raw: unknown): Promise<NormalizedNode> {
    const record = asRecord(raw)
    const wrapperType = firstString(record.type)?.toLowerCase()
    let body = wrapperType === 'node' ? asRecord(record.data) : record

    const linkedId = firstString(body.id)
    const hasContent = body.content != null || body.message != null || record.content != null || record.message != null
    if (linkedId && !hasContent && this.internal?.getMsg) {
      body = asRecord(await this.internal.getMsg(linkedId))
    }

    const sender = asRecord(body.sender ?? record.sender)
    const content = body.content ?? body.message ?? record.content ?? record.message
    const { parts, resources, nestedIds } = parseParts(content)
    if (!parts.length) parts.push(textPart(linkedId ? '[引用消息]' : '[空消息]', 'placeholder'))
    const text = parts.map(part => part.text).join('').trim() || '[空消息]'

    return {
      message: {
        timestamp: parseTimestamp(body.time ?? record.time),
        originalId: firstString(body.message_id, body.messageId, body.id, record.message_id, record.messageId, record.id),
        sender: senderInfo(sender, body),
        parts,
        text,
        resources,
      },
      nestedIds,
    }
  }
}
