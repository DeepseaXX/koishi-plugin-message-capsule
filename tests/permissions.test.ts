import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePermissions } from '../src/permissions'
import type { Config } from '../src/config'

const flags = (canUse: boolean, canSaveLocal = false) => ({
  canUse,
  canSaveLocal,
  canUploadGroupFile: false,
  canResendText: false,
  canSaveImages: false,
})

test('permissions default to deny', () => {
  const config = { userPermissions: [], groupPermissions: [] } as Pick<Config, 'userPermissions' | 'groupPermissions'>
  assert.deepEqual(resolvePermissions(config, '10001', '20001'), flags(false))
})

test('permission priority is user > group > group default > global default', () => {
  const config = {
    userPermissions: [
      { userId: 'default', ...flags(false) },
      { userId: '10001', ...flags(true, true) },
    ],
    groupPermissions: [
      { guildId: 'default', ...flags(true) },
      { guildId: '20001', ...flags(false) },
    ],
  } as Pick<Config, 'userPermissions' | 'groupPermissions'>

  assert.equal(resolvePermissions(config, '10001', '20001').canSaveLocal, true)
  assert.equal(resolvePermissions(config, '10002', '20001').canUse, false)
  assert.equal(resolvePermissions(config, '10002', '20002').canUse, true)
  assert.equal(resolvePermissions(config, '10002').canUse, false)
})
