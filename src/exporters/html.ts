import { ExportDocument, ExportSettings } from '../types'
import { AssetMode, createExportView, ViewMessage, ViewPart } from './view'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderPart(part: ViewPart) {
  if (part.type === 'image' && part.image) {
    return `<figure class="media"><img src="${escapeHtml(part.image)}" alt="图片" loading="lazy"><figcaption>${escapeHtml(part.text)}</figcaption></figure>`
  }
  const className = part.type === 'text' ? 'text' : `token token-${part.type}`
  return `<span class="${className}">${escapeHtml(part.text)}</span>`
}

function detailLine(message: ViewMessage) {
  const details: string[] = []
  if (message.sender.userId) details.push(`用户 ID ${escapeHtml(message.sender.userId)}`)
  if (message.sender.originalId) details.push(`用户 ID ${escapeHtml(message.sender.originalId)}`)
  if (message.originalId) details.push(`消息 ID ${escapeHtml(message.originalId)}`)
  return details.length ? `<div class="ids">${details.join(' · ')}</div>` : ''
}

export function renderHtml(
  document: ExportDocument,
  settings: ExportSettings,
  assetMode: AssetMode = 'relative',
) {
  const view = createExportView(document, settings, assetMode)
  const messages = view.messages.map(message => `
    <article class="message">
      <div class="avatar">${message.sender.avatar
        ? `<img src="${escapeHtml(message.sender.avatar)}" alt="头像">`
        : escapeHtml(message.sender.displayName.slice(0, 1).toUpperCase())}</div>
      <div class="bubble-wrap">
        <header><strong>${escapeHtml(message.sender.displayName)}</strong>${message.time ? `<time>${escapeHtml(message.time)}</time>` : ''}</header>
        ${detailLine(message)}
        <div class="bubble">${message.parts.map(renderPart).join('')}</div>
      </div>
    </article>`).join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: file:; style-src 'unsafe-inline'">
  <title>消息胶囊</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif; color: #202124; background: #eef2f7; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 28px 18px; background: #eef2f7; }
    .archive { width: min(860px, 100%); margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 12px 40px rgba(31, 45, 61, .12); }
    .hero { padding: 28px 32px 22px; color: #fff; background: linear-gradient(135deg, #4f6bed, #7357d9); }
    .hero h1 { margin: 0 0 8px; font-size: 26px; }
    .hero p { margin: 4px 0; opacity: .9; font-size: 14px; }
    .messages { padding: 24px 28px 12px; }
    .message { display: flex; gap: 12px; margin: 0 0 20px; break-inside: avoid; }
    .avatar { flex: 0 0 42px; width: 42px; height: 42px; display: grid; place-items: center; overflow: hidden; border-radius: 50%; color: #fff; background: #6f7f96; font-weight: 700; }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .bubble-wrap { min-width: 0; max-width: calc(100% - 54px); }
    header { display: flex; gap: 10px; align-items: baseline; margin: 0 4px 5px; }
    header strong { font-size: 14px; }
    header time, .ids { color: #8892a0; font-size: 11px; }
    .ids { margin: -2px 4px 5px; overflow-wrap: anywhere; }
    .bubble { display: inline-block; min-width: 56px; padding: 10px 13px; border-radius: 4px 15px 15px 15px; background: #f1f4f8; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere; }
    .token { color: #55677f; }
    .media { margin: 7px 0 2px; }
    .media img { display: block; max-width: min(520px, 100%); max-height: 680px; border-radius: 10px; object-fit: contain; background: #e7ebf0; }
    .media figcaption { margin-top: 4px; color: #7a8594; font-size: 11px; }
    footer { padding: 18px 32px 24px; color: #7d8794; border-top: 1px solid #edf0f3; font-size: 12px; line-height: 1.7; }
    footer a { color: #596fce; }
  </style>
</head>
<body>
  <main class="archive">
    <section class="hero">
      <h1>消息胶囊</h1>
      <p>共 ${view.messageCount} 条消息</p>
      <p>导出于 ${escapeHtml(view.exportedAt)} · ${escapeHtml(view.source.platform)}</p>
    </section>
    <section class="messages">${messages}</section>
    <footer>
      由 koishi-plugin-message-capsule 生成。<br>
      导出格式设计参考并感谢 <a href="https://github.com/shuakami/qq-chat-exporter">qq-chat-exporter</a> 原作者。
    </footer>
  </main>
</body>
</html>`
}
