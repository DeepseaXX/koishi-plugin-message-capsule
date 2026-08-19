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

插件默认拒绝所有人执行指令。

请先完成：

1. 在 **“1️⃣ 首次使用与权限管理”** 中添加用户或群组规则。
2. 开启 **“允许调用指令”**。
3. 按用途开启其他权限：
   - 本地保存
   - 群文件
   - 发送到当前会话
   - 保存图片

## 使用方法

### 最简单的用法

回复一条合并聊天记录，然后输入：

\`\`\`text
msgcap
\`\`\`

这会使用默认设置，以纯文字发送；默认会把全部内容放在同一条消息里。

### 导出文件

指令固定为：

\`\`\`text
msgcap [format] [target]
\`\`\`

\`format\`：输出格式。


| format | 说明 |
| --- | --- |
| \`default\` | 使用设置中的“默认格式”。 |
| \`txt\` | 纯文本文件（\`.txt\`）。 |
| \`json\` | JSON 结构化数据（\`.json\`）。 |
| \`md\` | Markdown 文档（\`.md\`）。 |
| \`image\` | PNG 长图；需要加载 \`puppeteer\`。 |

\`target\`：输出位置或发送方式。

| target | 说明 |
| --- | --- |
| \`default\` | 使用设置中的“默认目标”。 |
| \`local\` | 保存到本地；需要设置保存目录和本地保存权限。 |
| \`group\` | 上传到当前群文件；只能在群聊中使用。 |
| \`chat\` | 将 txt / md / json 作为文字发送，将 image 作为图片发送。 |

纯文字快捷指令：

| 指令 | 作用 |
| --- | --- |
| \`singlechat\` | 全部内容合并成一条普通文字消息发送。 |
| \`batchchat\` | 按设置的每组消息数和字数限制，分成多条普通文字消息发送。 |

常用组合：

| 指令 | 作用 |
| --- | --- |
| \`msgcap\` | 使用默认格式和默认目标。 |
| \`msgcap default group\` | 使用默认格式，上传到群文件。 |
| \`msgcap group\` | 同上；省略 \`format\` 时，单独的 \`group\` 会被识别为目标。 |
| \`msgcap txt local\` | 导出 TXT，保存到本地。 |
| \`msgcap json group\` | 导出 JSON，上传到群文件。 |
| \`msgcap md group\` | 导出 Markdown，上传到群文件。 |
| \`msgcap md chat\` | 将 Markdown 作为纯文本发送到当前会话。 |
| \`msgcap json chat\` | 将 JSON 作为纯文本发送到当前会话。 |
| \`msgcap image chat\` | 将 PNG 长图作为图片发送到当前会话。 |
| \`msgcap image local\` | 导出 PNG 长图，保存到本地。 |
| \`msgcap image group\` | 导出 PNG 长图，上传到群文件。 |
| \`msgcap singlechat\` | 全部内容放在同一条普通文字消息里发送。 |
| \`msgcap batchchat\` | 将内容分批后分别发送为普通文字消息。 |
| \`msgcap chat\` | 兼容写法，按设置中的发送方式处理。 |

注意：

- 省略 \`target\` 时使用设置中的默认目标，例如 \`msgcap txt\`。
- \`txt\`、\`md\` 和 \`json\` 会作为文字发送，\`image\` 会作为图片发送；四种格式都可以使用 \`chat\`。
- 例如 \`msgcap json chat\`、\`msgcap md chat\` 和 \`msgcap image chat\` 都可以正常发送。
- 兼容旧参数：\`text\`、\`markdown\`、\`html\`、\`web\`、\`img\`、\`png\`、\`resend\` 以及旧中文参数仍可使用，但推荐使用上表中的英文写法。

### 纯文字发送


\`\`\`text
msgcap singlechat
msgcap batchchat
msgcap txt singlechat
msgcap txt batchchat
\`\`\`

\`singlechat\`：把全部记录拼成一条普通文字消息发送，消息之间空一行。
\`batchchat\`：按设置的每组消息数和字数限制，分成多条普通文字消息发送。
旧的 \`chat --single\` 和 \`chat --batch\` 仍可使用，但推荐改用上面的快捷指令。

消息定型文默认是：

\`\`\`text
\${用户昵称} \${日期时间}
\${消息内容}
\`\`\`

内容开关优先于定型文。

### 单次选项

- \`--images\` / \`--no-images\`：是否保存图片。
- \`--time\` / \`--no-time\`：是否保存时间。
- \`--user-id\` / \`--no-user-id\`：是否保存用户 ID。
- \`--nickname\` / \`--no-nickname\`：是否使用群昵称。
- \`--id\` / \`--no-id\`：是否保存原始 ID。

### 使用前注意

- PNG 长图需要加载 \`puppeteer\` 插件。
- 长期保存需要填写保存目录；留空时不会创建目录，也不会执行本地保存。
- 单次最多处理 200 条消息。

## 适配器兼容性

### 完整支持

提供 \`getForwardMsg\` 的 OneBot 适配器，可以读取带 ID 的折叠合并记录。

### 条件支持

其他 Satori 兼容适配器如果提供以下内容，也可以解析：

- 标准 \`forward\` 元素
- 已展开的 \`message forward\` 节点
- 已展开的 \`figure\` 节点

### 暂不支持

只有普通 \`quote\`、文本引用或平台私有转发字段，且没有标准展开节点和读取接口的适配器。
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
