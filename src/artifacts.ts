import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'koishi'
import { Config } from './config'
import { renderHtml } from './exporters/html'
import { renderScreenshot } from './exporters/image'
import { renderJson } from './exporters/json'
import { renderMarkdown } from './exporters/markdown'
import { renderText } from './exporters/text'
import { saveResources } from './resources'
import { ArtifactResult, ExportDocument, ExportFormat, ExportSettings } from './types'

const extensions: Record<ExportFormat, string> = {
  txt: '.txt',
  json: '.json',
  markdown: '.md',
  image: '.png',
}

function compactText(value: string, limit = 24) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function safeFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
    .trim()
}

export function renderArtifactBaseName(
  document: ExportDocument,
  settings: Config,
  format: ExportFormat,
) {
  const first = document.messages[0]
  const firstMessage = compactText(first?.text || '空消息') || '空消息'
  const firstTime = first?.timestamp
    ? new Date(first.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19)
    : '无时间'
  const formatName = format === 'markdown' ? 'md' : format
  const values: Record<string, string> = {
    '${插件名}': '消息胶囊',
    '${首条消息}': firstMessage,
    '${首条时间}': firstTime,
    '${消息条数}': String(document.messages.length),
    '${导出格式}': formatName,
    '${平台}': document.source.platform || 'unknown',
  }
  const source = settings.fileNameTemplate.trim() || '消息胶囊-${首条消息}-${首条时间}-${消息条数}条'
  const rendered = source.replace(/\$\{[^}]+\}/g, token => values[token] ?? token)
  return safeFileName(rendered) || '消息胶囊'
}

export async function createArtifact(
  ctx: Context,
  config: Config,
  document: ExportDocument,
  settings: ExportSettings,
  format: ExportFormat,
  workspace: string,
): Promise<ArtifactResult> {
  const resources = await saveResources(ctx, document, workspace, settings, config)
  const mainFile = path.join(workspace, `${renderArtifactBaseName(document, config, format)}${extensions[format]}`)

  if (format === 'txt') {
    await writeFile(mainFile, renderText(document, settings), 'utf8')
  } else if (format === 'json') {
    await writeFile(mainFile, renderJson(document, settings), 'utf8')
  } else if (format === 'markdown') {
    await writeFile(mainFile, renderMarkdown(document, settings), 'utf8')
  } else {
    const html = renderHtml(document, settings, 'file-url')
    await renderScreenshot(ctx, html, mainFile, config.screenshotWidth, config.screenshotScale)
  }

  return {
    ...resources,
    mainFile,
    allFiles: [mainFile, ...resources.files],
  }
}
