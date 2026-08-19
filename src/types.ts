export type ExportFormat = 'txt' | 'json' | 'html' | 'image'

export type ExportTarget = 'local' | 'group' | 'chat'

export interface PermissionFlags {
  canUse: boolean
  canSaveLocal: boolean
  canUploadGroupFile: boolean
  canResendText: boolean
  canSaveImages: boolean
}

export interface UserPermissionRule extends PermissionFlags {
  userId: string
}

export interface GroupPermissionRule extends PermissionFlags {
  guildId: string
}

export interface SenderInfo {
  nickname?: string
  groupNickname?: string
  userId?: string
  originalId?: string
  avatarUrl?: string
  avatarPath?: string
  avatarAbsolutePath?: string
}

export interface ExportResource {
  type: 'image'
  sourceUrl?: string
  originalName?: string
  localPath?: string
  absolutePath?: string
  mime?: string
  size?: number
}

export interface MessagePart {
  type: 'text' | 'image' | 'mention' | 'emoji' | 'placeholder'
  text: string
  resource?: ExportResource
}

export interface ExportMessage {
  index: number
  timestamp?: number
  originalId?: string
  sender: SenderInfo
  parts: MessagePart[]
  text: string
  resources: ExportResource[]
}

export interface ExportSource {
  platform: string
  forwardId?: string
  guildId?: string
  channelId?: string
}

export interface ExportDocument {
  exportedAt: string
  source: ExportSource
  messages: ExportMessage[]
}

export interface ExportSettings {
  includeMessageTime: boolean
  includeUserId: boolean
  includeGroupNickname: boolean
  includeOriginalId: boolean
  includeAvatar: boolean
  saveImages: boolean
}

export interface SavedResourceResult {
  files: string[]
  warnings: string[]
  savedImages: number
  savedAvatars: number
}

export interface ArtifactResult extends SavedResourceResult {
  mainFile: string
  allFiles: string[]
}
