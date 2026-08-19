import { Schema } from 'koishi'
import { ExportFormat, ExportTarget, GroupPermissionRule, UserPermissionRule } from './types'

export interface Config {
  commandName: string
  defaultFormat: ExportFormat
  defaultTarget: ExportTarget
  outputPath: string
  userPermissions: UserPermissionRule[]
  groupPermissions: GroupPermissionRule[]
  permissionNotice: string
  saveImages: boolean
  includeMessageTime: boolean
  includeUserId: boolean
  includeGroupNickname: boolean
  includeOriginalId: boolean
  includeAvatar: boolean
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
  canSaveLocal: Schema.boolean().default(false).description('允许将导出结果长期保存到 Koishi 所在设备'),
  canUploadGroupFile: Schema.boolean().default(false).description('允许把导出文件上传到当前群文件'),
  canResendText: Schema.boolean().default(false).description('允许把记录以纯文字合并转发重新发送到当前会话'),
  canSaveImages: Schema.boolean().default(false).description('允许下载原消息图片、头像或生成 PNG 长图'),
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
      '消息胶囊尚未向你开放。请联系插件管理员，在“权限管理”中为你的用户或当前群开启“允许调用指令”，并按用途开启本地保存、群文件或文字重发。',
    ).description('用户没有“允许调用指令”权限时收到的提示。'),
  }).description('1️⃣ 首次使用与权限管理（默认全部拒绝，请先配置）'),

  Schema.object({
    commandName: Schema.string().pattern(/^\S+$/).default('消息胶囊').description('总指令名称'),
    defaultFormat: Schema.union([
      Schema.const('txt').description('TXT 纯文本'),
      Schema.const('json').description('JSON 结构化数据'),
      Schema.const('html').description('HTML 网页'),
      Schema.const('image').description('由 HTML 渲染的 PNG 长图'),
    ]).default('txt').description('未指定格式时使用的格式'),
    defaultTarget: Schema.union([
      Schema.const('local').description('保存到本地'),
      Schema.const('group').description('上传到当前群文件'),
      Schema.const('chat').description('以纯文字合并转发重新发送'),
    ]).default('local').description('未指定目标时使用的处理方式'),
    outputPath: Schema.string().default('data/message-capsule')
      .description('本地导出目录；相对路径以 Koishi 工作目录为基准'),
  }).description('2️⃣ 基本设置'),

  Schema.object({
    saveImages: Schema.boolean().default(false).description('默认下载并保存记录中的图片（单次可用 --images 开启）'),
    includeMessageTime: Schema.boolean().default(true).description('保存每条消息的日期与时间'),
    includeUserId: Schema.boolean().default(false).description('保存发送者用户 ID（兼容各平台编号）'),
    includeGroupNickname: Schema.boolean().default(true).description('优先保存并显示群昵称 / 群名片'),
    includeOriginalId: Schema.boolean().default(false).description('保存消息和发送者的原始 ID'),
    includeAvatar: Schema.boolean().default(false).description('下载并保存发送者头像'),
  }).description('3️⃣ 默认导出内容（均可由单次指令选项覆盖）'),

  Schema.object({
    maxMessages: Schema.natural().min(1).max(10000).default(2000).description('单次最多处理的消息数'),
    maxForwardDepth: Schema.natural().min(0).max(10).default(3).description('嵌套合并转发的最大展开深度'),
    maxImages: Schema.natural().min(0).max(1000).default(100).description('单次最多保存的图片与头像总数'),
    maxImageSizeMB: Schema.number().min(0.1).max(100).step(0.1).default(10).description('单张图片最大体积（MB）'),
    maxTotalImageSizeMB: Schema.number().min(0.1).max(1000).step(0.1).default(100).description('单次图片总大小上限（MB）'),
    imageTimeoutSeconds: Schema.number().min(1).max(120).default(15).description('单张图片下载超时（秒）'),
    resendBatchSize: Schema.natural().min(1).max(100).default(100).description('文字重发时每组合并转发包含的最大消息数'),
    screenshotWidth: Schema.natural().min(480).max(1920).default(900).description('PNG 长图的页面宽度'),
    screenshotScale: Schema.number().min(0.5).max(3).step(0.25).default(1).description('PNG 长图像素倍率'),
  }).description('4️⃣ 资源与性能限制'),

  Schema.object({
    debug: Schema.boolean().default(false).description('输出调试日志').experimental(),
  }).description('5️⃣ 调试设置'),
]) as Schema<Config>
