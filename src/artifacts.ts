import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'koishi'
import { Config } from './config'
import { renderHtml } from './exporters/html'
import { renderScreenshot } from './exporters/image'
import { renderJson } from './exporters/json'
import { renderText } from './exporters/text'
import { saveResources } from './resources'
import { ArtifactResult, ExportDocument, ExportFormat, ExportSettings } from './types'

const extensions: Record<ExportFormat, string> = {
  txt: '.txt',
  json: '.json',
  html: '.html',
  image: '.png',
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
  const mainFile = path.join(workspace, `消息胶囊${extensions[format]}`)

  if (format === 'txt') {
    await writeFile(mainFile, renderText(document, settings), 'utf8')
  } else if (format === 'json') {
    await writeFile(mainFile, renderJson(document, settings), 'utf8')
  } else if (format === 'html') {
    await writeFile(mainFile, renderHtml(document, settings), 'utf8')
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
