import assert from 'node:assert/strict'
import test from 'node:test'
import { h } from 'koishi'
import { ForwardParseError, ForwardParser, parseCqString } from '../src/parser'

test('CQ parser preserves text and image segments', () => {
  const segments = parseCqString('你好[CQ:image,file=a.jpg,url=https://example.com/a.jpg]再见')
  assert.equal(segments.length, 3)
  assert.equal(segments[0].type, 'text')
  assert.equal(segments[1].type, 'image')
  assert.equal(segments[2].type, 'text')
})

test('parser loads a quoted OneBot merged forward', async () => {
  const parser = new ForwardParser({
    async getForwardMsg(id) {
      assert.equal(id, 'forward-1')
      return [{
        sender: { user_id: 123456, nickname: 'QQ昵称', card: '群名片', uid: 'uid-1' },
        time: 1_700_000_000,
        message_id: 42,
        content: '你好[CQ:image,file=a.jpg,url=https://example.com/a.jpg]',
      }]
    },
  }, { maxMessages: 100, maxDepth: 3 })

  const result = await parser.parseQuote({ elements: [h('forward', { id: 'forward-1' })] })
  assert.equal(result.forwardId, 'forward-1')
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].sender.userId, '123456')
  assert.equal(result.messages[0].sender.groupNickname, '群名片')
  assert.equal(result.messages[0].timestamp, 1_700_000_000_000)
  assert.equal(result.messages[0].resources[0].sourceUrl, 'https://example.com/a.jpg')
  assert.match(result.messages[0].text, /你好\[图片\]/)
})

test('parser accepts an already expanded Satori forward without OneBot API', async () => {
  const parser = new ForwardParser(undefined, { maxMessages: 100, maxDepth: 3 })
  const quote = h('message', { forward: true }, [
    h('message', { userId: '123', nickname: 'Alice', time: 1_700_000_000_000 }, [
      h('author', { id: '123', name: 'Alice', time: 1_700_000_000_000 }),
      h.text('inline message'),
    ]),
  ])
  const result = await parser.parseQuote({ elements: [quote] })
  assert.equal(result.messages.length, 1)
  assert.equal(result.messages[0].text, 'inline message')
  assert.equal(result.messages[0].sender.nickname, 'Alice')
})

test('parser rejects a normal quoted message', async () => {
  const parser = new ForwardParser(undefined, { maxMessages: 100, maxDepth: 3 })
  await assert.rejects(
    parser.parseQuote({ elements: [h.text('ordinary')] }),
    (error: unknown) => error instanceof ForwardParseError && error.code === 'not-forward',
  )
})
