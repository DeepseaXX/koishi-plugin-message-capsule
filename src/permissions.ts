import { Config } from './config'
import { PermissionFlags } from './types'

export const deniedPermissions: PermissionFlags = Object.freeze({
  canUse: false,
  canSaveLocal: false,
  canUploadGroupFile: false,
  canResendText: false,
  canSaveImages: false,
})

function normalize(rule?: Partial<PermissionFlags>): PermissionFlags {
  if (!rule) return deniedPermissions
  return {
    canUse: rule.canUse === true,
    canSaveLocal: rule.canSaveLocal === true,
    canUploadGroupFile: rule.canUploadGroupFile === true,
    canResendText: rule.canResendText === true,
    canSaveImages: rule.canSaveImages === true,
  }
}

export function resolvePermissions(
  config: Pick<Config, 'userPermissions' | 'groupPermissions'>,
  userId?: string,
  guildId?: string,
): PermissionFlags {
  const users = config.userPermissions ?? []
  const groups = config.groupPermissions ?? []

  if (userId) {
    const exactUser = users.find(rule => rule.userId === userId)
    if (exactUser) return normalize(exactUser)
  }

  if (guildId) {
    const exactGroup = groups.find(rule => rule.guildId === guildId)
    if (exactGroup) return normalize(exactGroup)

    const defaultGroup = groups.find(rule => rule.guildId === 'default')
    if (defaultGroup) return normalize(defaultGroup)
  }

  return normalize(users.find(rule => rule.userId === 'default'))
}

export function hasAnyAuthorizedCaller(config: Pick<Config, 'userPermissions' | 'groupPermissions'>) {
  return [...(config.userPermissions ?? []), ...(config.groupPermissions ?? [])]
    .some(rule => rule.canUse === true)
}
