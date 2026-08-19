import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Context } from 'koishi'
import { Config } from './config'
import { ExportDocument, ExportResource, ExportSettings, SavedResourceResult } from './types'

interface HttpResponse {
  data: ReadableStream<Uint8Array>
  headers: Headers
}

interface HttpService {
  (url: string, config: { responseType: 'stream', timeout: number }): Promise<HttpResponse>
}

interface DownloadedFile {
  absolutePath: string
  mime: string
  size: number
}

const mimeExtensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/svg+xml': '.svg',
}

function safeExtension(mime: string | undefined, source: string) {
  const normalizedMime = mime?.split(';', 1)[0].trim().toLowerCase()
  if (normalizedMime && mimeExtensions[normalizedMime]) return mimeExtensions[normalizedMime]
  try {
    const extension = path.extname(new URL(source).pathname).toLowerCase()
    if (/^\.(?:jpe?g|png|gif|webp|bmp|tiff?|svg)$/.test(extension)) return extension
  } catch {}
  return '.img'
}

async function writeDataUrl(source: string, assetsDir: string, baseName: string, maxBytes: number): Promise<DownloadedFile> {
  const match = /^data:(image\/[\w.+-]+);base64,([a-z\d+/=\s]+)$/i.exec(source)
  if (!match) throw new Error('不支持的图片 data URL')
  const data = Buffer.from(match[2], 'base64')
  if (data.length > maxBytes) throw new Error('图片超过单文件或总大小限制')
  const extension = safeExtension(match[1], source)
  const absolutePath = path.join(assetsDir, `${baseName}${extension}`)
  await writeFile(absolutePath, data, { flag: 'wx' })
  return { absolutePath, mime: match[1], size: data.length }
}

async function streamHttpImage(
  http: HttpService,
  source: string,
  assetsDir: string,
  baseName: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<DownloadedFile> {
  const response = await http(source, { responseType: 'stream', timeout: timeoutMs })
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error('图片超过单文件或总大小限制')
  }
  const mime = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() || 'application/octet-stream'
  if (!mime.startsWith('image/')) throw new Error(`远程资源不是图片（${mime}）`)

  const extension = safeExtension(mime, source)
  const absolutePath = path.join(assetsDir, `${baseName}${extension}`)
  const partialPath = `${absolutePath}.part`
  const handle = await open(partialPath, 'wx')
  const reader = response.data.getReader()
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel('image size limit exceeded')
        throw new Error('图片超过单文件或总大小限制')
      }
      await handle.write(value)
    }
  } catch (error) {
    await handle.close()
    await rm(partialPath, { force: true })
    throw error
  }

  await handle.close()
  await rename(partialPath, absolutePath)
  return { absolutePath, mime, size }
}

async function downloadImage(
  ctx: Context,
  source: string,
  assetsDir: string,
  baseName: string,
  maxBytes: number,
  timeoutMs: number,
) {
  if (/^data:image\//i.test(source)) {
    return writeDataUrl(source, assetsDir, baseName, maxBytes)
  }
  const parsed = new URL(source)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅允许下载 HTTP(S) 图片')
  }
  const http = (ctx as unknown as { http?: HttpService }).http
  if (!http) throw new Error('Koishi HTTP 服务未加载')
  return streamHttpImage(http, source, assetsDir, baseName, maxBytes, timeoutMs)
}

function attachResource(
  workspace: string,
  resource: ExportResource,
  downloaded: DownloadedFile,
) {
  resource.absolutePath = downloaded.absolutePath
  resource.localPath = path.relative(workspace, downloaded.absolutePath).replace(/\\/g, '/')
  resource.mime = downloaded.mime
  resource.size = downloaded.size
}

export async function saveResources(
  ctx: Context,
  document: ExportDocument,
  workspace: string,
  settings: ExportSettings,
  config: Config,
): Promise<SavedResourceResult> {
  const result: SavedResourceResult = { files: [], warnings: [], savedImages: 0 }
  if (!settings.saveImages) return result

  const assetsDir = path.join(workspace, 'assets')
  await mkdir(assetsDir, { recursive: true })
  const perFileLimit = Math.floor(config.maxImageSizeMB * 1024 * 1024)
  const totalLimit = Math.floor(config.maxTotalImageSizeMB * 1024 * 1024)
  const timeoutMs = Math.floor(config.imageTimeoutSeconds * 1000)
  const cache = new Map<string, DownloadedFile>()
  let totalBytes = 0
  let count = 0

  const obtain = async (source: string, baseName: string) => {
    const cached = cache.get(source)
    if (cached) return cached
    if (count >= config.maxImages) throw new Error('已达到单次图片数量上限')
    const remaining = totalLimit - totalBytes
    if (remaining <= 0) throw new Error('已达到单次图片总大小上限')
    const downloaded = await downloadImage(ctx, source, assetsDir, baseName, Math.min(perFileLimit, remaining), timeoutMs)
    cache.set(source, downloaded)
    result.files.push(downloaded.absolutePath)
    totalBytes += downloaded.size
    count++
    return downloaded
  }

  if (settings.saveImages) {
    let imageIndex = 0
    for (const message of document.messages) {
      for (const resource of message.resources) {
        if (!resource.sourceUrl) {
          result.warnings.push(`第 ${message.index} 条消息的图片没有可下载地址，已保留占位文本。`)
          continue
        }
        imageIndex++
        try {
          const downloaded = await obtain(resource.sourceUrl, `image-${String(imageIndex).padStart(4, '0')}`)
          attachResource(workspace, resource, downloaded)
          result.savedImages++
        } catch (error) {
          result.warnings.push(`第 ${message.index} 条消息的图片保存失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }

  return result
}
