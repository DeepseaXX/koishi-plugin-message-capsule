import { Context } from 'koishi'
import { registerCommands } from './command'
import { Config as ConfigSchema, Config } from './config'
import zhCN from './locales/zh-CN'
import { hasAnyAuthorizedCaller } from './permissions'

export const name = 'message-capsule'

export const inject = {
  optional: ['http', 'puppeteer'],
}

export const usage = `
## 首次使用

插件默认拒绝所有人执行指令。请先在 **“1️⃣ 首次使用与权限管理”** 中添加你的用户或群组，并按需要开启：调用指令、本地保存、群文件、文字重发和保存图片。

## 使用方法

1. 回复一条“合并聊天记录”或其他可处理消息。
2. 输入 \`消息胶囊 txt\`、\`消息胶囊 json\`、\`消息胶囊 html\` 或 \`消息胶囊 图片\`。
3. 也可以使用 \`消息胶囊 群文件 html\` 上传群文件，或使用 \`消息胶囊 重发\` 发送纯文字合并转发。

常用单次选项：\`--images / --no-images\`、\`--time / --no-time\`、\`--user-id / --no-user-id\`、\`--nickname / --no-nickname\`、\`--id / --no-id\`、\`--avatar / --no-avatar\`。

PNG 长图需要同时加载 \`puppeteer\` 插件。当前合并记录读取面向提供 \`getForwardMsg\` 的 Koishi OneBot 适配器；后续可扩展更多消息来源与触发方式。

## 适配器兼容性

- **完整支持**：提供“getForwardMsg”的 OneBot 适配器，可以读取带 ID 的折叠合并记录。
- **条件支持**：其他 Satori 兼容适配器如果把回复转换为标准“forward”元素，或直接提供已展开的“message forward”/“figure”节点，可以直接解析。
- **暂不支持**：只有普通“quote”、文本引用或平台私有转发字段，且没有标准展开节点和读取接口的适配器。
`

export { ConfigSchema as Config }
export * from './types'
export { resolvePermissions } from './permissions'
export { ForwardParser, ForwardParseError, parseCqString } from './parser'

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger(name)
  ctx.i18n.define('zh-CN', zhCN)
  if (!hasAnyAuthorizedCaller(config)) {
    logger.warn('当前权限表未允许任何用户调用指令；请先在插件设置的“首次使用与权限管理”中授权。')
  }
  registerCommands(ctx, config, logger)
}
