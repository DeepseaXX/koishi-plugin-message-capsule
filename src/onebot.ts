import { Session } from 'koishi'

export interface OneBotInternal {
  getForwardMsg(id: string | number): Promise<unknown>
  getMsg?(id: string | number): Promise<unknown>
}

export function getOneBotInternal(session: Session): OneBotInternal | undefined {
  const candidates = [
    (session.bot as unknown as { internal?: unknown }).internal,
    (session as unknown as { onebot?: unknown }).onebot,
  ]

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const api = candidate as Partial<OneBotInternal>
    if (typeof api.getForwardMsg !== 'function') continue
    return {
      getForwardMsg: api.getForwardMsg.bind(candidate),
      getMsg: typeof api.getMsg === 'function' ? api.getMsg.bind(candidate) : undefined,
    }
  }
}
