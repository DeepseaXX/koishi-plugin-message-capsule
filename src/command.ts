import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, h, Logger, Session } from 'koishi'
import { createArtifact, renderArtifactBaseName } from './artifacts'
import { Config } from './config'
import { createExportView } from './exporters/view'
import { ScreenshotServiceError } from './exporters/image'
import { getOneBotInternal } from './onebot'
import { ForwardParseError, ForwardParser } from './parser'
import { resolvePermissions } from './permissions'
import { ChatSendMode, ExportDocument, ExportFormat, ExportSettings, ExportTarget } from './types'
import { createStoredZip } from './zip'

interface CommandOptions {
  target?: string
  images?: boolean
  noImages?: boolean
  time?: boolean
  noTime?: boolean
  userId?: boolean
  noUserId?: boolean
  qq?: boolean
  noQq?: boolean
  nickname?: boolean
  noNickname?: boolean
  id?: boolean
  noId?: boolean
  avatar?: boolean
  noAvatar?: boolean
  single?: boolean
  batch?: boolean
}

class UserInputError extends Error {
  constructor(public key: 'invalid-format' | 'invalid-target' | 'format-target-conflict' | 'option-conflict', public params: string[]) {
    super(key)
  }
}

const formatAliases: Record<string, ExportFormat> = {
  txt: 'txt', text: 'txt', 文本: 'txt',
  json: 'json', 数据: 'json',
  md: 'markdown', markdown: 'markdown', 马克down: 'markdown',
  html: 'markdown', web: 'markdown', 网页: 'markdown',
  image: 'image', img: 'image', png: 'image', 图片: 'image', 长图: 'image',
}

const targetAliases: Record<string, ExportTarget> = {
  local: 'local', 本地: 'local', 保存: 'local',
  group: 'group', 群文件: 'group', 上传: 'group',
  chat: 'chat', resend: 'chat', 重发: 'chat', 文字: 'chat',
}

function t(session: Session, key: string, params: unknown[] = []) {
  return session.text(`message-capsule.messages.${key}`, params)
}

function booleanSetting(base: boolean, enable: boolean | undefined, disable: boolean | undefined, label: string) {
  if (enable && disable) throw new UserInputError('option-conflict', [label])
  if (enable) return true
  if (disable) return false
  return base
}

function resolveFormat(value: string | undefined, fallback: ExportFormat) {
  if (!value || value.toLowerCase() === 'default') return fallback
  const format = formatAliases[value.toLowerCase()]
  if (!format) throw new UserInputError('invalid-format', [value])
  return format
}

function resolveTarget(value: string | undefined, fallback: ExportTarget) {
  if (!value || value.toLowerCase() === 'default') return fallback
  const target = targetAliases[value.toLowerCase()]
  if (!target) throw new UserInputError('invalid-target', [value])
  return target
}

function resolveSettings(config: Config, options: CommandOptions): ExportSettings {
  return {
    saveImages: booleanSetting(config.saveImages, options.images, options.noImages, '保存图片'),
    includeMessageTime: booleanSetting(config.includeMessageTime, options.time, options.noTime, '消息时间'),
    includeUserId: booleanSetting(
      config.includeUserId,
      options.userId || options.qq,
      options.noUserId || options.noQq,
      '用户 ID',
    ),
    includeGroupNickname: booleanSetting(config.includeGroupNickname, options.nickname, options.noNickname, '群昵称'),
    includeOriginalId: booleanSetting(config.includeOriginalId, options.id, options.noId, '原始 ID'),
    includeAvatar: booleanSetting(config.includeAvatar, options.avatar, options.noAvatar, '头像'),
    messageTemplate: config.messageTemplate,
  }
}

function resolveChatSendMode(config: Config, options: CommandOptions): ChatSendMode {
  if (options.single && options.batch) throw new UserInputError('option-conflict', ['single / batch'])
  if (options.single) return 'single'
  if (options.batch) return 'batch'
  return config.chatSendMode
}

function timestampName() {
  const date = new Date()
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`
}

async function createLocalWorkspace(ctx: Context, config: Config) {
  const root = path.isAbsolute(config.outputPath)
    ? path.normalize(config.outputPath)
    : path.resolve(ctx.baseDir, config.outputPath)
  await mkdir(root, { recursive: true })
  const baseName = `消息胶囊-${timestampName()}`
  for (let index = 0; index < 100; index++) {
    const workspace = path.join(root, index ? `${baseName}-${index}` : baseName)
    try {
      await mkdir(workspace)
      return workspace
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }
  throw new Error('无法创建不重复的导出目录')
}

function forwardAuthorName(message: ReturnType<typeof createExportView>['messages'][number]) {
  const details: string[] = []
  if (message.sender.userId) details.push(`用户ID:${message.sender.userId}`)
  if (message.sender.originalId) details.push(`ID:${message.sender.originalId}`)
  if (message.originalId) details.push(`消息ID:${message.originalId}`)
  return details.length ? `${message.sender.displayName} (${details.join(' ')})` : message.sender.displayName
}

function splitForwardMessages(
  messages: ReturnType<typeof createExportView>['messages'],
  mode: ChatSendMode,
  batchSize: number,
  maxLength: number,
) {
  if (mode === 'batch') {
    const batches: Array<typeof messages> = []
    for (let offset = 0; offset < messages.length; offset += batchSize) {
      batches.push(messages.slice(offset, offset + batchSize))
    }
    return batches
  }

  const batches: Array<typeof messages> = []
  let current: typeof messages = []
  let length = 0
  for (const message of messages) {
    const extra = current.length ? 1 : 0
    if (current.length && length + extra + message.formatted.length > maxLength) {
      batches.push(current)
      current = []
      length = 0
    }
    current.push(message)
    length += (current.length > 1 ? 1 : 0) + message.formatted.length
  }
  if (current.length) batches.push(current)
  return batches
}

async function resendAsText(
  session: Session,
  document: ExportDocument,
  settings: ExportSettings,
  mode: ChatSendMode,
  batchSize: number,
  maxLength: number,
) {
  const view = createExportView(document, settings)
  for (const batch of splitForwardMessages(view.messages, mode, batchSize, maxLength)) {
    const nodes = batch.map((message) => {
      const name = forwardAuthorName(message)
      const content = message.formatted
      const id = settings.includeUserId ? message.sender.userId : undefined
      return h('message', {
        userId: id,
        username: name,
        nickname: name,
        time: settings.includeMessageTime ? document.messages[message.index - 1]?.timestamp : undefined,
      }, [
        h('author', { id, name, time: settings.includeMessageTime ? document.messages[message.index - 1]?.timestamp : undefined }),
        h.text(content),
      ])
    })
    await session.send(h('message', { forward: true }, nodes))
  }
}

function addOptions(command: any) {
  return command
    .option('target', '-t, --target <target:string> 兼容写法：目标 local / group / chat')
    .option('images', '-i, --images              本次保存消息图片')
    .option('noImages', '--no-images             本次不保存消息图片')
    .option('time', '--time                      本次保存消息日期与时间')
    .option('noTime', '--no-time                 本次不保存消息日期与时间')
    .option('userId', '--user-id                   本次保存发送者用户 ID')
    .option('noUserId', '--no-user-id              本次不保存发送者用户 ID')
    .option('qq', '--qq                          --user-id 的兼容别名')
    .option('noQq', '--no-qq                     --no-user-id 的兼容别名')
    .option('nickname', '--nickname                    本次保存群昵称')
    .option('noNickname', '--no-nickname                 本次不保存群昵称')
    .option('id', '--id                          本次保存原始 ID')
    .option('noId', '--no-id                     本次不保存原始 ID')
    .option('avatar', '--avatar                      本次保存头像')
    .option('noAvatar', '--no-avatar                   本次不保存头像')
    .option('single', '--single                     合并转发尽量合并为单条，超限时分条')
    .option('batch', '--batch                      按固定消息数分条合并转发')
}

export function registerCommands(ctx: Context, config: Config, logger: Logger) {
  const run = async (
    session: Session,
    options: CommandOptions,
    requestedFormat: string | undefined,
    requestedTarget?: string,
  ) => {
    const permissions = resolvePermissions(config, session.userId, session.guildId)
    if (!permissions.canUse) return config.permissionNotice

    try {
      let target = resolveTarget(options.target, config.defaultTarget)
      let formatInput = requestedFormat
      if (formatInput && targetAliases[formatInput.toLowerCase()]) {
        target = targetAliases[formatInput.toLowerCase()]
        formatInput = requestedTarget
      } else if (requestedTarget) {
        const positionalTarget = resolveTarget(requestedTarget, target)
        if (options.target && positionalTarget !== target) {
          throw new UserInputError('option-conflict', ['目标'])
        }
        target = positionalTarget
      }
      const resolvedFormat = resolveFormat(formatInput, config.defaultFormat)
      const explicitFormat = !!formatInput && formatInput.toLowerCase() !== 'default'
      if (target === 'chat' && explicitFormat && resolvedFormat !== 'txt') {
        throw new UserInputError('format-target-conflict', [resolvedFormat, target])
      }
      const format = target === 'chat' ? 'txt' : resolvedFormat
      const settings = resolveSettings(config, options)
      const sendMode = resolveChatSendMode(config, options)

      if (target === 'local' && !permissions.canSaveLocal) return t(session, 'deny-local')
      if (target === 'local' && !config.outputPath.trim()) return t(session, 'local-path-missing')
      if (target === 'group' && !permissions.canUploadGroupFile) return t(session, 'deny-group')
      if (target === 'chat' && !permissions.canResendText) return t(session, 'deny-chat')
      if (target === 'group' && !session.guildId) return t(session, 'group-only')
      if (target === 'chat' && (options.images || options.avatar)) return t(session, 'chat-media')

      if (target === 'chat') {
        settings.saveImages = false
        settings.includeAvatar = false
      }
      if ((settings.saveImages || settings.includeAvatar || format === 'image') && !permissions.canSaveImages) {
        return t(session, 'deny-images')
      }
      if (!session.quote) return t(session, 'need-quote')

      const maxMessages = Math.min(config.maxMessages, 200)
      const parser = new ForwardParser(getOneBotInternal(session), {
        maxMessages,
        maxDepth: config.maxForwardDepth,
      })
      const parsed = await parser.parseQuote(session.quote)
      const document: ExportDocument = {
        exportedAt: new Date().toISOString(),
        source: {
          platform: session.platform || 'unknown',
          forwardId: parsed.forwardId,
          guildId: session.guildId,
          channelId: session.channelId,
        },
        messages: parsed.messages,
      }

      if (target === 'chat') {
        await resendAsText(session, document, settings, sendMode, Math.min(config.resendBatchSize, 200), config.resendMaxLength)
        return t(session, 'chat-success', [document.messages.length])
      }

      let workspace: string
      let temporary = false
      if (target === 'local') {
        workspace = await createLocalWorkspace(ctx, config)
      } else {
        workspace = await mkdtemp(path.join(os.tmpdir(), 'message-capsule-'))
        temporary = true
      }

      let completedLocalExport = false
      try {
        const artifact = await createArtifact(ctx, config, document, settings, format, workspace)
        if (config.debug) artifact.warnings.forEach(warning => logger.debug(warning))
        const warningText = artifact.warnings.length
          ? t(session, 'warning-count', [artifact.warnings.length])
          : ''

        if (target === 'local') {
          completedLocalExport = true
          return t(session, 'local-success', [document.messages.length, workspace, warningText])
        }

        let uploadFile = artifact.mainFile
        if (artifact.allFiles.length > 1) {
          uploadFile = path.join(workspace, `${renderArtifactBaseName(document, config, format)}.zip`)
          await createStoredZip(artifact.allFiles.map(file => ({
            source: file,
            name: path.relative(workspace, file).replace(/\\/g, '/'),
          })), uploadFile)
        }
        await session.send(h.file(pathToFileURL(uploadFile).href, { title: path.basename(uploadFile) }))
        return t(session, 'group-success', [document.messages.length, warningText])
      } finally {
        if (temporary || (target === 'local' && !completedLocalExport)) {
          await rm(workspace, { recursive: true, force: true })
        }
      }
    } catch (error) {
      if (error instanceof UserInputError) return t(session, error.key, error.params)
      if (error instanceof ScreenshotServiceError) return t(session, 'screenshot-unavailable')
      if (error instanceof ForwardParseError) {
        if (error.code === 'no-quote') return t(session, 'need-quote')
        if (error.code === 'not-forward') return t(session, 'not-forward')
        if (error.code === 'unsupported') return t(session, 'unsupported-adapter')
        if (error.code === 'empty') return t(session, 'empty-forward')
        if (error.code === 'limit') return t(session, 'message-limit', [Math.min(config.maxMessages, 200)])
      }
      logger.warn('failed to export replied forward message: %s', error instanceof Error ? error.stack ?? error.message : String(error))
      return t(session, 'generic-error', [error instanceof Error ? error.message : String(error)])
    }
  }

  addOptions(ctx.command(`${config.commandName} [format:string] [target:string]`, '处理被回复的消息或合并记录', { authority: 0 }))
    .usage('统一写法：msgcap [format] [target]. Formats: txt / json / md / image / default. Targets: local / group / chat / default.')
    .example(`${config.commandName}`)
    .example(`${config.commandName} txt local`)
    .example(`${config.commandName} json group`)
    .example(`${config.commandName} md group --images`)
    .example(`${config.commandName} image local`)
    .example(`${config.commandName} chat --single`)
    .example(`${config.commandName} default group`)
    .action(({ session, options }: { session: Session, options: CommandOptions }, format?: string, target?: string) => run(session, options, format, target))
}
