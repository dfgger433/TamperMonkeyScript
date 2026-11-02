import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser } from './harness.mjs'

const FOLLOWINGS = {
  code: 0,
  message: 'OK',
  data: {
    total: 2,
    list: [
      { mid: 1, uname: '甲', attribute: 0, face: 'http://i0.hdslb.com/a.jpg', sign: 's1', mtime: 100, follower: 10 },
      { mid: 2, uname: '乙', attribute: 6, face: 'https://i0.hdslb.com/b.jpg', sign: 's2', mtime: 200, follower: 20 },
    ],
  },
}

test('同步关注列表时保留 IP 检测结果', async () => {
  const routes = [{ match: 'api.bilibili.com/x/relation/followings', respond: () => FOLLOWINGS }]
  const { app } = boot({ routes })
  open(app)
  app.state.list = [
    makeUser({ uid: 1, name: '甲', ip: '上海', ipChecked: true, ipAt: 111 }),
    makeUser({ uid: 2, name: '乙', ip: '', ipChecked: true, ipAt: 222 }),
  ]

  await app.syncData()

  assert.equal(app.state.list.length, 2)
  const first = app.state.list.find((u) => u.uid === 1)
  const second = app.state.list.find((u) => u.uid === 2)
  assert.equal(first.ip, '上海')
  assert.equal(first.ipChecked, true)
  assert.equal(first.ipAt, 111)
  assert.equal(second.ip, '')
  assert.equal(second.ipChecked, true, '已检测·无 IP 的状态也要保留')
})

test('同步不会把旧的 IP 结果带串到新用户', async () => {
  const routes = [{ match: 'api.bilibili.com/x/relation/followings', respond: () => FOLLOWINGS }]
  const { app } = boot({ routes })
  open(app)
  app.state.list = [makeUser({ uid: 999, name: '老用户', ip: '北京', ipChecked: true })]
  await app.syncData()
  const fresh = app.state.list.find((u) => u.uid === 999)
  assert.equal(fresh, undefined)
  assert.ok(app.state.list.every((u) => u.ip === '' && u.ipChecked === false))
})

test('同步后 attribute=6 记为互关、face 去掉 http:', async () => {
  const routes = [{ match: 'api.bilibili.com/x/relation/followings', respond: () => FOLLOWINGS }]
  const { app } = boot({ routes })
  open(app)
  await app.syncData()
  const first = app.state.list.find((u) => u.uid === 1)
  const second = app.state.list.find((u) => u.uid === 2)
  assert.equal(first.mutual, false)
  assert.equal(second.mutual, true)
  assert.ok(!first.face.startsWith('http:'))
})
