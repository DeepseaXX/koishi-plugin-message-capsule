import { createReadStream } from 'node:fs'
import { open, stat } from 'node:fs/promises'

export interface ZipEntry {
  source: string
  name: string
}

interface PreparedEntry extends ZipEntry {
  crc: number
  size: number
  offset: number
  nameBuffer: Buffer
  dosDate: number
  dosTime: number
}

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index++) {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

async function crc32File(file: string) {
  let crc = 0xffffffff
  for await (const chunk of createReadStream(file)) {
    for (const byte of chunk as Buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function dosTimestamp(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    dosTime: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    dosDate: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function localHeader(entry: PreparedEntry) {
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0x0800, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt16LE(entry.dosTime, 10)
  header.writeUInt16LE(entry.dosDate, 12)
  header.writeUInt32LE(entry.crc, 14)
  header.writeUInt32LE(entry.size, 18)
  header.writeUInt32LE(entry.size, 22)
  header.writeUInt16LE(entry.nameBuffer.length, 26)
  header.writeUInt16LE(0, 28)
  return header
}

function centralHeader(entry: PreparedEntry) {
  const header = Buffer.alloc(46)
  header.writeUInt32LE(0x02014b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(20, 6)
  header.writeUInt16LE(0x0800, 8)
  header.writeUInt16LE(0, 10)
  header.writeUInt16LE(entry.dosTime, 12)
  header.writeUInt16LE(entry.dosDate, 14)
  header.writeUInt32LE(entry.crc, 16)
  header.writeUInt32LE(entry.size, 20)
  header.writeUInt32LE(entry.size, 24)
  header.writeUInt16LE(entry.nameBuffer.length, 28)
  header.writeUInt16LE(0, 30)
  header.writeUInt16LE(0, 32)
  header.writeUInt16LE(0, 34)
  header.writeUInt16LE(0, 36)
  header.writeUInt32LE(0, 38)
  header.writeUInt32LE(entry.offset, 42)
  return header
}

export async function createStoredZip(entries: ZipEntry[], output: string) {
  if (!entries.length) throw new Error('ZIP 至少需要一个文件')
  const prepared: PreparedEntry[] = []
  const outputHandle = await open(output, 'wx')
  let offset = 0

  try {
    for (const entry of entries) {
      const info = await stat(entry.source)
      if (info.size > 0xffffffff) throw new Error('单个文件超过 ZIP32 上限')
      const { dosDate, dosTime } = dosTimestamp(info.mtime)
      const preparedEntry: PreparedEntry = {
        ...entry,
        name: entry.name.replace(/\\/g, '/').replace(/^\/+/, ''),
        nameBuffer: Buffer.from(entry.name.replace(/\\/g, '/').replace(/^\/+/, ''), 'utf8'),
        crc: await crc32File(entry.source),
        size: info.size,
        offset,
        dosDate,
        dosTime,
      }
      const header = localHeader(preparedEntry)
      await outputHandle.write(header)
      await outputHandle.write(preparedEntry.nameBuffer)
      offset += header.length + preparedEntry.nameBuffer.length
      for await (const chunk of createReadStream(entry.source)) {
        const buffer = chunk as Buffer
        await outputHandle.write(buffer)
        offset += buffer.length
      }
      prepared.push(preparedEntry)
    }

    const centralOffset = offset
    for (const entry of prepared) {
      const header = centralHeader(entry)
      await outputHandle.write(header)
      await outputHandle.write(entry.nameBuffer)
      offset += header.length + entry.nameBuffer.length
    }
    const centralSize = offset - centralOffset
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(0, 4)
    end.writeUInt16LE(0, 6)
    end.writeUInt16LE(prepared.length, 8)
    end.writeUInt16LE(prepared.length, 10)
    end.writeUInt32LE(centralSize, 12)
    end.writeUInt32LE(centralOffset, 16)
    end.writeUInt16LE(0, 20)
    await outputHandle.write(end)
  } finally {
    await outputHandle.close()
  }
}
