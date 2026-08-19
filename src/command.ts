import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, h, Logger, Session } from 'koishi'
import { createArtifact, renderArtifactBaseName } from './artifacts'
import { Config } from './config'
import { renderJson } from './exporters/json'
import { renderMarkdown } from './exporters/markdown'
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
  single?: boolean
  batch?: boolean
}

class UserInputError extends Error {
  constructor(public key: 'invalid-format' | 'invalid-target' | 'option-conflict', public params: string[]) {
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

const chatModeAliases: Record<string, ChatSendMode> = {
  singlechat: 'single',
  batchchat: 'batch',
}

const targetAliases: Record<string, ExportTarget> = {
  local: 'local', 本地: 'local', 保存: 'local',
  group: 'group', 群文件: 'group', 上传: 'group',
  chat: 'chat', singlechat: 'chat', batchchat: 'chat', resend: 'chat', 重发: 'chat', 文字: 'chat',
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
    messageTemplate: config.messageTemplate,
  }
}

function resolveChatSendMode(config: Config, options: CommandOptions, requested?: ChatSendMode): ChatSendMode {
  if (options.single && options.batch) throw new UserInputError('option-conflict', ['single / batch'])
  if (requested && (options.single || options.batch)) throw new UserInputError('option-conflict', ['singlechat / batchchat'])
  if (requested) return requested
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

function splitForwardMessages(
  messages: ReturnType<typeof createExportView>['messages'],
  mode: ChatSendMode,
  batchSize: number,
  maxLength: number,
) {
  if (mode === 'single') return messages.length ? [messages] : []

  if (mode === 'batch') {
    const batches: Array<typeof messages> = []
    let current: typeof messages = []
    let length = 0
    for (const message of messages) {
      current.push(message)
      length += (current.length > 1 ? 1 : 0) + message.formatted.length
      if (current.length >= batchSize || length >= maxLength) {
        batches.push(current)
        current = []
        length = 0
      }
    }
    if (current.length) batches.push(current)
    return batches
  }

  return messages.length ? [messages] : []
}

async function resendAsText(
  session: Session,
  document: ExportDocument,
  settings: ExportSettings,
  format: ExportFormat,
  mode: ChatSendMode,
  batchSize: number,
  maxLength: number,
) {
  if (format === 'json') {
    await session.send(renderJson(document, settings))
    return
  }
  if (format === 'markdown') {
    await session.send(renderMarkdown(document, settings))
    return
  }

  const view = createExportView(document, settings)
  for (const batch of splitForwardMessages(view.messages, mode, batchSize, maxLength)) {
    await session.send(batch.map(message => message.formatted).join('\n\n'))
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
    .option('single', '--single                     兼容旧写法：请改用 singlechat')
    .option('batch', '--batch                      兼容旧写法：请改用 batchchat')
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
      let requestedChatMode: ChatSendMode | undefined
      if (formatInput && targetAliases[formatInput.toLowerCase()]) {
        const alias = formatInput.toLowerCase()
        const positionalTarget = targetAliases[alias]
        if (options.target && positionalTarget !== target) {
          throw new UserInputError('option-conflict', ['目标'])
        }
        target = positionalTarget
        requestedChatMode = chatModeAliases[alias]
        formatInput = requestedTarget
      } else if (requestedTarget) {
        const alias = requestedTarget.toLowerCase()
        const positionalTarget = resolveTarget(requestedTarget, target)
        if (options.target && positionalTarget !== target) {
          throw new UserInputError('option-conflict', ['目标'])
        }
        target = positionalTarget
        requestedChatMode = chatModeAliases[alias]
      }
      const resolvedFormat = resolveFormat(formatInput, config.defaultFormat)
      const format = resolvedFormat
      const settings = resolveSettings(config, options)
      const sendMode = resolveChatSendMode(config, options, requestedChatMode)

      if (target === 'local' && !permissions.canSaveLocal) return t(session, 'deny-local')
      if (target === 'local' && !config.outputPath.trim()) return t(session, 'local-path-missing')
      if (target === 'group' && !permissions.canUploadGroupFile) return t(session, 'deny-group')
      if (target === 'chat' && !permissions.canResendText) return t(session, 'deny-chat')
      if (target === 'group' && !session.guildId) return t(session, 'group-only')
      if (target === 'chat' && options.images && format !== 'image') return t(session, 'chat-media')

      if (target === 'chat' && format !== 'image') {
        settings.saveImages = false
      }
      if ((settings.saveImages || format === 'image') && !permissions.canSaveImages) {
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

      if (target === 'chat' && format !== 'image') {
        await resendAsText(session, document, settings, format, sendMode, Math.min(config.resendBatchSize, 200), config.resendMaxLength)
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

        if (target === 'chat') {
          await session.send(h.image(pathToFileURL(artifact.mainFile).href))
          return t(session, 'chat-success', [document.messages.length])
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
    .usage('统一写法：msgcap [format] [target]. Formats: txt / json / md / image / default. Targets: local / group / chat / default. Text shortcuts: singlechat / batchchat.')
    .example(`${config.commandName}`)
    .example(`${config.commandName} txt local`)
    .example(`${config.commandName} json group`)
    .example(`${config.commandName} md group --images`)
    .example(`${config.commandName} image local`)
    .example(`${config.commandName} singlechat`)
    .example(`${config.commandName} batchchat`)
    .example(`${config.commandName} default group`)
    .action(({ session, options }: { session: Session, options: CommandOptions }, format?: string, target?: string) => run(session, options, format, target))
}
