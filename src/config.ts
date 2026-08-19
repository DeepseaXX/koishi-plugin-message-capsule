import { Schema } from 'koishi'
import { ChatSendMode, ExportFormat, ExportTarget, GroupPermissionRule, UserPermissionRule } from './types'

export interface Config {
  commandName: string
  defaultFormat: ExportFormat
  defaultTarget: ExportTarget
  chatSendMode: ChatSendMode
  resendMaxLength: number
  messageTemplate: string
  fileNameTemplate: string
  outputPath: string
  userPermissions: UserPermissionRule[]
  groupPermissions: GroupPermissionRule[]
  permissionNotice: string
  saveImages: boolean
  includeMessageTime: boolean
  includeUserId: boolean
  includeGroupNickname: boolean
  includeOriginalId: boolean
  maxMessages: number
  maxForwardDepth: number
  maxImages: number
  maxImageSizeMB: number
  maxTotalImageSizeMB: number
  imageTimeoutSeconds: number
  resendBatchSize: number
  screenshotWidth: number
  screenshotScale: number
  debug: boolean
}

const permissionFields = {
  canUse: Schema.boolean().default(false).description('允许调用本插件的任何指令'),
  canSaveLocal: Schema.boolean().default(false).description('允许将导出结果长期保存到 Koishi 所在设备；还必须设置保存目录'),
  canUploadGroupFile: Schema.boolean().default(false).description('允许把导出文件上传到当前群文件'),
  canResendText: Schema.boolean().default(false).description('允许把导出内容发送到当前会话；文字会作为消息发送，PNG 会作为图片发送'),
  canSaveImages: Schema.boolean().default(false).description('允许下载原消息图片或生成 PNG 长图；模板中的图片路径也受此开关控制'),
}

const denyAll = {
  canUse: false,
  canSaveLocal: false,
  canUploadGroupFile: false,
  canResendText: false,
  canSaveImages: false,
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    userPermissions: Schema.array(Schema.object({
      userId: Schema.string().required().description('用户 ID；填写 default 表示全局默认'),
      ...permissionFields,
    })).role('table').default([{ userId: 'default', ...denyAll }])
      .description('用户权限。精确用户规则的优先级最高；初始状态为全局拒绝。'),
    groupPermissions: Schema.array(Schema.object({
      guildId: Schema.string().required().description('群号 / 群组 ID；填写 default 表示所有群的默认规则'),
      ...permissionFields,
    })).role('table').default([])
      .description('群权限。优先级：用户精确 > 群精确 > 群默认 > 全局默认 > 拒绝。'),
    permissionNotice: Schema.string().role('textarea', { rows: [2, 4] }).default(
      '消息胶囊尚未向你开放。请联系插件管理员，在“权限管理”中为你的用户或当前群开启“允许调用指令”，并按用途开启本地保存、群文件或发送到当前会话。',
    ).description('用户没有“允许调用指令”权限时收到的提示。'),
  }).description('1️⃣ 首次使用与权限管理（默认全部拒绝，请先配置）'),

  Schema.object({
    commandName: Schema.string().pattern(/^\S+$/).default('msgcap').description('总指令名称（默认：msgcap）'),
    defaultFormat: Schema.union([
      Schema.const('txt').description('TXT 纯文本'),
      Schema.const('json').description('JSON 结构化数据'),
      Schema.const('markdown').description('Markdown 文档（.md）'),
      Schema.const('image').description('由 HTML 渲染的 PNG 长图'),
    ]).default('txt').description('未指定格式时使用的格式；默认是 TXT 纯文本'),
    defaultTarget: Schema.union([
      Schema.const('local').description('保存到本地（需要设置保存目录）'),
      Schema.const('group').description('上传到当前群文件'),
      Schema.const('chat').description('以纯文字重新发送'),
    ]).default('chat').description('未指定目标时的发送方式；默认是把全部内容放在一条普通文字消息里发送'),
    chatSendMode: Schema.union([
      Schema.const('single').description('把全部内容合并到一条普通文字消息中发送'),
      Schema.const('batch').description('按每组消息数和字数限制，分成多条普通文字消息发送'),
    ]).default('single').description('纯文字发送的默认方式；singlechat 和 batchchat 可单次覆盖'),
    resendMaxLength: Schema.natural().min(200).max(20000).default(4000)
      .description('批量发送时单条消息的字数上限；singlechat 会忽略此限制并尝试一次发送全部内容'),
    messageTemplate: Schema.string().role('textarea', { rows: [4, 10] }).default(
      '${用户昵称} ${日期时间}\n${消息内容}',
    ).description('每条消息的定型文。内容开关优先于定型文；常用变量为 ${用户昵称}、${日期时间}、${消息内容}，完整变量请查看插件帮助。'),
    fileNameTemplate: Schema.string().default(
      '消息胶囊-${首条消息}-${首条时间}-${消息条数}条',
    ).description('导出文件名定型文。默认包含首条消息、首条时间和消息条数；非法字符会自动替换。'),
    outputPath: Schema.string().default('')
      .description('长期保存目录；留空则关闭本地保存功能，不会自动创建目录。填写相对路径时以 Koishi 工作目录为基准。'),
  }).description('2️⃣ 基本设置'),

  Schema.object({
    saveImages: Schema.boolean().default(false).description('默认下载并保存记录中的图片（单次可用 --images 开启）'),
    includeMessageTime: Schema.boolean().default(true).description('保存每条消息的日期与时间'),
    includeUserId: Schema.boolean().default(false).description('保存发送者用户 ID（兼容各平台编号，通常用于展示；不是用户名）'),
    includeGroupNickname: Schema.boolean().default(true).description('优先保存并显示群昵称 / 群名片'),
    includeOriginalId: Schema.boolean().default(false).description('保存平台返回的消息和发送者原始 ID（这是编号，不是用户名）'),
  }).description('3️⃣ 默认导出内容（均可由单次指令选项覆盖）'),

  Schema.object({
    maxMessages: Schema.natural().min(1).max(200).default(200).description('单次最多处理的消息数，默认和上限都是 200'),
    maxForwardDepth: Schema.natural().min(0).max(10).default(3).description('嵌套合并转发的最大展开深度'),
    maxImages: Schema.natural().min(0).max(1000).default(100).description('单次最多保存的图片总数'),
    maxImageSizeMB: Schema.number().min(0.1).max(100).step(0.1).default(10).description('单张图片最大体积（MB）'),
    maxTotalImageSizeMB: Schema.number().min(0.1).max(1000).step(0.1).default(100).description('单次图片总大小上限（MB）'),
    imageTimeoutSeconds: Schema.number().min(1).max(120).default(15).description('单张图片下载超时（秒）'),
    resendBatchSize: Schema.natural().min(1).max(200).default(100).description('批量发送模式下，每条普通文字消息包含的最大消息数'),
    screenshotWidth: Schema.natural().min(480).max(1920).default(900).description('PNG 长图的渲染画布宽度；内容页默认限制为 516px'),
    screenshotScale: Schema.number().min(0.5).max(3).step(0.25).default(1).description('PNG 长图像素倍率'),
  }).description('4️⃣ 资源与性能限制'),

  Schema.object({
    debug: Schema.boolean().default(false).description('输出调试日志').experimental(),
  }).description('5️⃣ 调试设置'),
]) as Schema<Config>
