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
2. 输入 \`msgcap\`，默认以纯文字合并转发。
3. 需要文件时统一使用 \`msgcap [format] [target]\`，例如 \`msgcap txt local\`、\`msgcap json group\`、\`msgcap md group\` 或 \`msgcap image local\`。其中 \`default\` 表示使用设置中的默认值。

常用单次选项：\`--images / --no-images\`、\`--time / --no-time\`、\`--user-id / --no-user-id\`、\`--nickname / --no-nickname\`、\`--id / --no-id\`、\`--avatar / --no-avatar\`。

纯文字发送可用 \`msgcap chat --single\`（尽量一条，超限分条）或 \`msgcap chat --batch\`（按固定消息数分条）。消息定型文默认是 \'\${用户昵称} \${日期时间}\\n\${消息内容}\'；内容开关优先于定型文。

PNG 长图需要同时加载 \`puppeteer\` 插件。长期保存需要填写保存目录；留空时不会创建目录，也不会执行本地保存操作。当前合并记录读取面向提供 \`getForwardMsg\` 的 Koishi OneBot 适配器；其他适配器在提供标准展开节点时也可以工作。

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
