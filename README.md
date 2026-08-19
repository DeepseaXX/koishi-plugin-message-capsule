# koishi-plugin-message-capsule

“消息胶囊”是一个把被回复的消息或合并记录封装成可保存、可分享内容的 Koishi 插件。

当前版本从合并记录开始，支持 TXT、JSON、HTML、PNG 长图、本地文件、群文件和纯文字合并转发。插件名称和内部结构已经按后续增加更多消息来源、触发方式与处理动作预留扩展空间。

> 安全默认值：插件首次加载后，所有权限均为关闭状态。管理员必须先在设置页授权，任何用户才能执行指令。

## 开始使用

### 1. 加载消息来源适配器

适配器兼容性分为三种情况：

| 情况 | 支持程度 | 要求 |
| --- | --- | --- |
| OneBot 适配器 | 完整支持 | 提供 `getForwardMsg`，可以读取带 ID 的折叠合并记录 |
| 其他 Satori 兼容适配器 | 条件支持 | 将回复转换为标准 `forward` 元素，或直接提供已展开的 `message forward` / `figure` 节点 |
| 只有普通引用的适配器 | 暂不支持 | 只有 `quote`、文本或平台私有字段，无法取得合并记录节点 |

插件不会扫描其他历史消息。适配器没有读取接口时，会返回明确提示，而不是假设平台字段格式。

如果需要生成 PNG 长图，还要在 Koishi 中加载 `puppeteer` 插件。TXT、JSON、HTML、群文件和文字重发不依赖 Puppeteer。

### 2. 首次配置权限

打开插件设置中的“1️⃣ 首次使用与权限管理”，为用户或群组添加规则。

每条规则分别控制：

- 是否允许调用插件指令
- 是否允许长期保存到 Koishi 所在设备
- 是否允许上传到当前群文件
- 是否允许以纯文字合并转发重新发送
- 是否允许保存原消息图片、头像或生成 PNG

初始的 `default` 用户规则会拒绝全部操作。权限优先级为：

`用户精确规则 > 当前群精确规则 > 群 default 规则 > 用户 default 规则 > 拒绝`

## 指令

先回复一条合并记录，再输入：

```text
msgcap txt
```

常用子指令：

```text
msgcap txt
msgcap json
msgcap html
msgcap 图片
msgcap 群文件 html
msgcap 重发
```

总指令也支持目标选项：

```text
msgcap html --target local
msgcap json --target group
msgcap txt --target chat
```

其中 `local` 表示本地保存，`group` 表示群文件，`chat` 表示纯文字重发。

## 导出格式

| 格式 | 用途 |
| --- | --- |
| `txt` | 易读的纯文本，适合快速查看与长期保存 |
| `json` | 包含消息、发送者、元素与导出选项的结构化数据 |
| `html` | 可直接用浏览器打开的聊天气泡页面 |
| `image` / `图片` | 先生成同款 HTML，再通过 Puppeteer 渲染为 PNG 长图 |

本插件不提供 Excel 导出。

当群文件导出同时保存图片或头像时，插件会将主文件和 `assets/` 资源打包为 ZIP 后上传。没有额外资源时会直接上传 TXT、JSON、HTML 或 PNG。

## 单次选项

设置页中的内容开关是默认值，每次执行时都可以覆盖：

| 开启 | 关闭 | 默认值 |
| --- | --- | --- |
| `--images` | `--no-images` | 关闭 |
| `--time` | `--no-time` | 开启 |
| `--user-id` | `--no-user-id` | 关闭 |
| `--nickname` | `--no-nickname` | 开启 |
| `--id` | `--no-id` | 关闭 |
| `--avatar` | `--no-avatar` | 关闭 |

`--qq` 和 `--no-qq` 保留为 `--user-id` 的兼容别名，方便已有习惯继续使用。

示例：

```text
msgcap html --images --time --no-user-id --nickname --no-id --no-avatar
msgcap 图片 --no-images --avatar
```

即使通过选项开启了图片或头像，调用者仍必须拥有“允许保存图片”权限。“重发”模式固定为纯文字，不下载图片和头像；图片、语音、视频、文件等内容会变成文字占位符。

## 本地文件

默认保存位置为 Koishi 工作目录下的：

```text
data/message-capsule/
└── 消息胶囊-20260819-120000-000/
    ├── 消息胶囊.txt
    └── assets/                 # 只有开启图片或头像后才会出现
```

可以在设置页修改 `outputPath`。每次处理使用独立目录，不覆盖已有记录。

## 设置说明

设置页从常用到进阶分为五组：

1. 首次使用与权限管理
2. 基本设置：指令名、默认格式、默认目标和保存目录
3. 默认导出内容：时间、用户 ID、群昵称、原始 ID、头像和消息图片
4. 资源与性能限制：消息数、嵌套深度、图片数量/体积、下载超时和长图尺寸
5. 调试设置

图片默认不下载。下载时采用逐块写入，并同时限制单张大小、总大小和总数量；嵌套深度、单次消息数和文字重发批次也有上限。

## 数据与隐私

- 只有回复消息并执行指令时才会读取该条记录。
- 默认不保存用户 ID、原始 ID、头像和消息图片。
- 关闭某字段后，TXT、JSON、HTML 和 PNG 都不会输出该字段；没有可显示名称时使用 `用户1`、`用户2` 之类的临时别名。
- 图片只接受 HTTP(S) 或 `data:image/*` 来源，不读取消息提供的本地文件路径。
- 临时群文件导出在上传完成后立即清理；“保存到本地”才会长期保留文件。

请只处理你有权处理的聊天记录，并遵守所在地区法律、平台规则和群成员的隐私约定。

## 开发与本地验证

在插件目录中执行单插件检查：

```bash
npm run typecheck
npm test
npm run build
npm pack --dry-run
```

本工作区约定：仓库级构建、身份确认和未来发布命令必须从 `D:\CODE\koishi-app` 执行：

```powershell
Set-Location D:\CODE\koishi-app
npm run build
npm whoami
npm run pub --verbose
```

`npm run pub --verbose` 只应在版本号、仓库地址、npm 权限、打包文件列表和 Koishi 市场元数据均确认完成，并明确决定发布后执行。npm 认证信息只保存在本机安全配置中，不得写入源码、README、提交记录或构建产物。

## 致谢

感谢 [shuakami/qq-chat-exporter](https://github.com/shuakami/qq-chat-exporter) 的原作者与贡献者。该项目为聊天导出的数据层次、TXT/JSON/HTML 可读性和资源组织方式提供了重要参考。

本插件针对 Koishi 的消息处理场景从零实现，不包含参考项目源码，也不复制其全量聊天历史抓取架构。

同时感谢 Koishi、Satori、OneBot 和 NapCat 社区。

## 许可证

[MIT](./LICENSE)
