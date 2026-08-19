import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context, h, Logger, Session } from 'koishi'
import { createArtifact } from './artifacts'
import { Config } from './config'
import { createExportView } from './exporters/view'
import { ScreenshotServiceError } from './exporters/image'
import { getOneBotInternal } from './onebot'
import { ForwardParseError, ForwardParser } from './parser'
import { resolvePermissions } from './permissions'
import { ExportDocument, ExportFormat, ExportSettings, ExportTarget } from './types'
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
}

class UserInputError extends Error {
  constructor(public key: 'invalid-format' | 'invalid-target' | 'option-conflict', public params: string[]) {
    super(key)
  }
}

const formatAliases: Record<string, ExportFormat> = {
  txt: 'txt', text: 'txt', 文本: 'txt',
  json: 'json', 数据: 'json',
  html: 'html', web: 'html', 网页: 'html',
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
  if (!value) return fallback
  const format = formatAliases[value.toLowerCase()]
  if (!format) throw new UserInputError('invalid-format', [value])
  return format
}

function resolveTarget(value: string | undefined, fallback: ExportTarget) {
  if (!value) return fallback
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
  }
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

function messageBody(message: ReturnType<typeof createExportView>['messages'][number]) {
  return message.parts.map(part => part.text).join('').trim() || '[空消息]'
}

function forwardAuthorName(message: ReturnType<typeof createExportView>['messages'][number]) {
  const details: string[] = []
  if (message.sender.userId) details.push(`用户ID:${message.sender.userId}`)
  if (message.sender.originalId) details.push(`ID:${message.sender.originalId}`)
  if (message.originalId) details.push(`消息ID:${message.originalId}`)
  return details.length ? `${message.sender.displayName} (${details.join(' ')})` : message.sender.displayName
}

async function resendAsText(session: Session, document: ExportDocument, settings: ExportSettings, batchSize: number) {
  const view = createExportView(document, settings)
  for (let offset = 0; offset < view.messages.length; offset += batchSize) {
    const nodes = view.messages.slice(offset, offset + batchSize).map((message) => {
      const name = forwardAuthorName(message)
      const content = message.time ? `[${message.time}]\n${messageBody(message)}` : messageBody(message)
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
    .option('target', '-t, --target <target:string> 目标：local / group / chat')
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
}

interface RunOverrides {
  format?: ExportFormat
  target?: ExportTarget
}

export function registerCommands(ctx: Context, config: Config, logger: Logger) {
  const run = async (
    session: Session,
    options: CommandOptions,
    requestedFormat: string | undefined,
    overrides: RunOverrides = {},
  ) => {
    const permissions = resolvePermissions(config, session.userId, session.guildId)
    if (!permissions.canUse) return config.permissionNotice

    try {
      let target = overrides.target ?? resolveTarget(options.target, config.defaultTarget)
      let formatInput = requestedFormat
      if (!overrides.format && formatInput && targetAliases[formatInput.toLowerCase()]) {
        target = targetAliases[formatInput.toLowerCase()]
        formatInput = undefined
      }
      const format = target === 'chat'
        ? 'txt'
        : overrides.format ?? resolveFormat(formatInput, config.defaultFormat)
      const settings = resolveSettings(config, options)

      if (target === 'local' && !permissions.canSaveLocal) return t(session, 'deny-local')
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

      const parser = new ForwardParser(getOneBotInternal(session), {
        maxMessages: config.maxMessages,
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
        await resendAsText(session, document, settings, config.resendBatchSize)
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
          uploadFile = path.join(workspace, `消息胶囊-${timestampName()}.zip`)
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
        if (error.code === 'limit') return t(session, 'message-limit', [config.maxMessages])
      }
      logger.warn('failed to export replied forward message: %s', error instanceof Error ? error.stack ?? error.message : String(error))
      return t(session, 'generic-error', [error instanceof Error ? error.message : String(error)])
    }
  }

  const root = addOptions(ctx.command(`${config.commandName} [format:string]`, '处理被回复的消息或合并记录', { authority: 0 }))
    .usage('回复一条消息或合并记录后使用。格式可选 txt、json、html、image；用 --target 选择本地、群文件或文字重发。')
    .example(`${config.commandName} txt`)
    .example(`${config.commandName} html --target group --images`)
    .example(`${config.commandName} image --no-user-id --nickname`)
    .action(({ session, options }: { session: Session, options: CommandOptions }, format?: string) => run(session, options, format))

  const formatChildren: Array<[string, ExportFormat, string]> = [
    ['txt', 'txt', '导出为 TXT 纯文本'],
    ['json', 'json', '导出为 JSON 结构化数据'],
    ['html', 'html', '导出为 HTML 网页'],
    ['图片', 'image', '把 HTML 渲染为 PNG 长图'],
  ]
  for (const [name, format, description] of formatChildren) {
    addOptions(root.subcommand(name, description))
      .action(({ session, options }: { session: Session, options: CommandOptions }) => run(session, options, undefined, { format }))
  }

  addOptions(root.subcommand('群文件 [format:string]', '把处理结果上传到当前群文件'))
    .action(({ session, options }: { session: Session, options: CommandOptions }, format?: string) => run(session, options, format, { target: 'group' }))

  addOptions(root.subcommand('重发', '把记录以纯文字合并转发重新发送'))
    .action(({ session, options }: { session: Session, options: CommandOptions }) => run(session, options, 'txt', { target: 'chat', format: 'txt' }))
}
