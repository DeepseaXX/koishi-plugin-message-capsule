# koishi-plugin-message-capsule

“消息胶囊”把你回复的消息或合并记录，整理成容易阅读、保存和分享的内容。它现在从“合并聊天记录”开始，但设计上不绑定 QQ，后续可以继续接入更多消息来源和触发方式。

插件首次加载时默认拒绝所有人使用。管理员需要先在设置页授权，再按需要打开本地保存、群文件、发送到当前会话和图片保存权限。

## 快速开始

1. 加载能够读取合并记录的适配器，并回复一条合并聊天记录。
2. 在插件设置的“首次使用与权限管理”中给自己开启“允许调用指令”。
3. 输入：

```text
msgcap
```

默认行为是把记录整理成纯文字，并把全部内容放在同一条普通文字消息里发送。

## 指令

所有指令参数统一使用英文，固定顺序是：

```text
msgcap [format] [target]
```

`format`：输出格式。

| 选项 | 说明 |
| --- | --- |
| `default` | 使用设置中的默认格式 |
| `txt` | 纯文本文件（`.txt`） |
| `json` | JSON 结构化数据（`.json`） |
| `md` | Markdown 文档（`.md`） |
| `image` | PNG 长图，需要 `puppeteer` |

`target`：输出位置或发送方式。

| 选项 | 说明 |
| --- | --- |
| `default` | 使用设置中的默认目标 |
| `local` | 保存到本地，需要保存目录和本地保存权限 |
| `group` | 上传到当前群文件，只能在群聊中使用 |
| `chat` | 将 txt / md / json 作为文字发送，将 image 作为图片发送 |

纯文字快捷指令：

| 指令 | 作用 |
| --- | --- |
| `singlechat` | 全部内容合并成一条普通文字消息发送 |
| `batchchat` | 按设置的每组消息数和字数限制，分成多条普通文字消息发送 |

常用组合：

| 指令 | 作用 |
| --- | --- |
| `msgcap` | 使用默认格式和默认目标 |
| `msgcap default group` | 使用默认格式，上传到群文件 |
| `msgcap group` | 同上；单独的 `group` 会被识别为目标 |
| `msgcap txt local` | 导出 TXT，保存到本地 |
| `msgcap json group` | 导出 JSON，上传到群文件 |
| `msgcap md group` | 导出 Markdown，上传到群文件 |
| `msgcap md chat` | 将 Markdown 作为纯文本发送到当前会话 |
| `msgcap json chat` | 将 JSON 作为纯文本发送到当前会话 |
| `msgcap image chat` | 将 PNG 长图作为图片发送到当前会话 |
| `msgcap image local` | 导出 PNG 长图，保存到本地 |
| `msgcap image group` | 导出 PNG 长图，上传到群文件 |
| `msgcap singlechat` | 全部内容放在同一条普通文字消息里发送 |
| `msgcap batchchat` | 将内容分批后分别发送为普通文字消息 |
| `msgcap chat` | 兼容写法，按设置中的发送方式处理 |

注意：

- 省略 `target` 时使用设置中的默认目标，例如 `msgcap txt`。
- `txt`、`md` 和 `json` 会作为文字发送，`image` 会作为图片发送；四种格式都可以使用 `chat`。
- 例如 `msgcap json chat`、`msgcap md chat` 和 `msgcap image chat` 都可以正常发送。
- 兼容旧参数：`text`、`markdown`、`html`、`web`、`img`、`png`、`resend` 以及旧中文参数仍可使用，但推荐使用上表中的英文写法。

`html` 是旧兼容别名，会导出 Markdown，不再生成 HTML 文件；PNG 内部仍会使用 HTML 作为渲染中间层。

如果上传群文件时同时保存了消息图片，插件会把主文件和 `assets/` 一起打包成 ZIP；没有附加资源时直接上传主文件。插件不再获取或保存发送者头像。

## 发送方式

纯文字发送推荐使用：

```text
msgcap singlechat               # 全部内容放在一条普通文字消息里
msgcap batchchat                # 按设置分成多条普通文字消息
msgcap txt singlechat           # 指定 TXT 作为文字内容来源
msgcap txt batchchat
```

设置页中的“发送方式”决定 `msgcap` 和 `msgcap chat` 的默认行为。旧的 `chat --single` 和 `chat --batch` 仍可使用，但推荐改用 `singlechat` 和 `batchchat`。

## 定型文

TXT、Markdown、JSON 和文字重发都会使用设置页中的“消息定型文”。默认值是：

```text
${用户昵称} ${日期时间}
${消息内容}
```

可用变量包括：

| 变量 | 含义 |
| --- | --- |
| `${用户昵称}` | 最终显示名称；关闭群昵称时使用用户名 |
| `${用户名}` | 发送者在适配器中的用户名/昵称 |
| `${群昵称}` | 群昵称或群名片 |
| `${用户ID}` | 兼容各平台的用户 ID |
| `${原始用户ID}` | 平台返回的原始用户编号 |
| `${消息ID}` / `${原始消息ID}` | 消息原始 ID |
| `${日期时间}` | 消息日期和时间 |
| `${消息内容}` | 文本、占位符及已保存的图片路径 |
| `${图片}` | 已保存图片的路径 |
| `${序号}` | 消息在本次记录中的序号 |
| `${平台}` | 来源适配器平台名 |

设置页的内容开关优先级更高。比如关闭“保存用户 ID”后，`${用户ID}` 无论定型文怎么写都会留空；关闭“保存图片”后，`${图片}` 和图片路径也不会输出。关闭“群昵称”后，`${用户昵称}` 会回退为用户名。

### 文件名定型文

导出文件名也可以在“文件名定型文”中自定义。默认值为：

```text
消息胶囊-${首条消息}-${首条时间}-${消息条数}条
```

可用变量是 `${插件名}`、`${首条消息}`、`${首条时间}`、`${消息条数}`、`${导出格式}` 和 `${平台}`。非法文件名字符会自动替换，过长的首条消息会截短。

## 设置重点

- “默认格式”默认是 TXT。
- “发送方式”默认是 single：把全部内容放在一条普通文字消息里发送。
- 单次最多处理 200 条消息，不能在设置中调到更高。
- “长期保存目录”默认为空。留空时不会创建目录，也不会执行本地保存操作；需要本地保存时请填写绝对路径或相对 Koishi 工作目录的路径。
- 图片默认不下载。下载消息图片或生成 PNG 还需要“允许保存图片”权限；插件不会获取发送者头像。

本地保存示例：

```text
data/message-capsule/
└── 消息胶囊-首条消息-首条时间-10条/
    ├── 消息胶囊-首条消息-首条时间-10条.txt
    └── assets/                 # 开启消息图片后才会出现
```

## 适配器兼容性

插件不把识别逻辑写死为 QQ：

- 提供 `getForwardMsg` 的 OneBot 适配器，可以读取带 ID 的折叠合并记录。
- 其他 Satori 兼容适配器，如果把回复转换为标准 `forward` 元素，或直接提供展开的 `message forward` / `figure` 节点，也可以解析。
- 只有普通 `quote`、文本引用或平台私有字段，且没有展开节点和读取接口时，插件会提示暂不支持，而不会猜测字段格式。

插件只在执行指令时读取当前回复的记录，不会扫描历史消息。临时群文件导出上传后立即清理；只有配置了本地保存目录并选择本地目标时才会长期留下文件。

## 开发与验证

单插件检查在插件目录执行：

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

工作区级构建和发布命令必须在 `D:\CODE\koishi-app` 执行：

```powershell
Set-Location D:\CODE\koishi-app
npm run build
npm whoami
npm run pub --verbose
```

npm token 只应保存在本机 npm 配置中，不要写入 README、源码、提交记录或构建产物。

## 参考与致谢

感谢 [shuakami/qq-chat-exporter](https://github.com/shuakami/qq-chat-exporter) 提供导出结构方面的参考。本插件针对 Koishi 的消息处理场景重新实现，不包含参考项目源码，也不复制其全量历史抓取架构。

同时感谢 Koishi、Satori、OneBot 和 NapCat 社区。

## 许可证

[MIT](./LICENSE)
