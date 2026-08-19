import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createStoredZip } from '../src/zip'

test('stored ZIP contains UTF-8 filenames and uncompressed data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qfe-zip-test-'))
  try {
    const source = path.join(directory, 'source.txt')
    const output = path.join(directory, 'result.zip')
    await writeFile(source, 'hello zip')
    await createStoredZip([{ source, name: '记录/消息.txt' }], output)
    const zip = await readFile(output)
    assert.equal(zip.readUInt32LE(0), 0x04034b50)
    const nameLength = zip.readUInt16LE(26)
    const extraLength = zip.readUInt16LE(28)
    const name = zip.subarray(30, 30 + nameLength).toString('utf8')
    const dataStart = 30 + nameLength + extraLength
    const size = zip.readUInt32LE(18)
    assert.equal(name, '记录/消息.txt')
    assert.equal(zip.subarray(dataStart, dataStart + size).toString(), 'hello zip')
    assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
