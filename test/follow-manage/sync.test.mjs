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

test('同步用接口新值覆盖旧粉丝数（老粉计划阈值靠它，不能用旧缓存）', async () => {
  const routes = [{
    match: 'api.bilibili.com/x/relation/followings',
    respond: () => ({ code: 0, data: { total: 1, list: [{ mid: 1, uname: '甲', attribute: 0, follower: 1200 }] } }),
  }]
  const { app } = boot({ routes })
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲', fans: 900 })]
  await app.syncData()
  assert.equal(app.state.list[0].fans, 1200, '粉丝数必须用本次同步的 follower，否则老粉计划预筛会误判')
})

test('同步接口没给粉丝数时才回退旧值', async () => {
  const routes = [{
    match: 'api.bilibili.com/x/relation/followings',
    respond: () => ({ code: 0, data: { total: 1, list: [{ mid: 1, uname: '甲', attribute: 0 }] } }),
  }]
  const { app } = boot({ routes })
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲', fans: 900 })]
  await app.syncData()
  assert.equal(app.state.list[0].fans, 900)
})

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

test('同步关注列表时保留老粉计划检测结果', async () => {
  const routes = [{ match: 'api.bilibili.com/x/relation/followings', respond: () => FOLLOWINGS }]
  const { app } = boot({ routes })
  open(app)
  app.state.list = [
    makeUser({ uid: 1, name: '甲', oldFan: true, oldFanDisplay: true, oldFanChecked: true, oldFanAt: 111 }),
  ]

  await app.syncData()

  const first = app.state.list.find((u) => u.uid === 1)
  assert.equal(first.oldFan, true)
  assert.equal(first.oldFanDisplay, true)
  assert.equal(first.oldFanChecked, true)
  assert.equal(first.oldFanAt, 111)
})

test('导入 1.0.3 备份（无 oldFan 字段）不会抹掉老粉计划结果', () => {
  const { app } = boot()
  open(app)
  app.state.list = [
    makeUser({ uid: 1, name: '甲', oldFan: true, oldFanDisplay: true, oldFanChecked: true, oldFanAt: 111 }),
  ]
  app.mergeImported([{ uid: 1, name: '甲', mutual: false, ip: '上海', ipChecked: true, ipAt: 1 }])

  assert.equal(app.state.list[0].oldFan, true, '备份没有 oldFan 时必须保留')
  assert.equal(app.state.list[0].oldFanChecked, true)
  assert.equal(app.state.list[0].oldFanAt, 111)
})

test('导入新版本备份会按备份覆盖老粉计划结果', () => {
  const { app } = boot()
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲', oldFan: true, oldFanChecked: true, oldFanAt: 111 })]
  app.mergeImported([{ uid: 1, name: '甲', mutual: false, oldFan: false, oldFanChecked: true, oldFanAt: 222 }])
  assert.equal(app.state.list[0].oldFan, false)
  assert.equal(app.state.list[0].oldFanAt, 222)
})

test('导入 1.0.0 备份不会抹掉已检测的 IP', () => {
  const { app } = boot()
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲', ip: '上海', ipChecked: true, ipAt: 111 })]
  // 1.0.0 导出的对象没有 ip 字段
  const oldBackup = [{ uid: 1, name: '甲', fans: 5, mutual: false, groups: [], followTime: 1 }]
  const added = app.mergeImported(oldBackup)

  assert.equal(added, 0)
  assert.equal(app.state.list[0].fans, 5, '其它字段按备份更新')
  assert.equal(app.state.list[0].ip, '上海', '备份没有 ip 时必须保留本机结果')
  assert.equal(app.state.list[0].ipChecked, true)
  assert.equal(app.state.list[0].ipAt, 111)
})

test('导入 1.0.2 备份会按备份覆盖 IP', () => {
  const { app } = boot()
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲', ip: '上海', ipChecked: true, ipAt: 111 })]
  app.mergeImported([{ uid: 1, name: '甲', mutual: false, ip: '北京', ipChecked: true, ipAt: 222 }])
  assert.equal(app.state.list[0].ip, '北京')
  assert.equal(app.state.list[0].ipAt, 222)
})

test('导入新用户正常追加', () => {
  const { app } = boot()
  open(app)
  app.state.list = []
  const added = app.mergeImported([
    { uid: 7, name: '新人', mutual: false, ip: '', ipChecked: false },
    { uid: 8, name: '新人2', mutual: false },
  ])
  assert.equal(added, 2)
  assert.equal(app.state.list.length, 2)
  assert.equal(app.state.list.find((u) => u.uid === 8).ipChecked, false)
})
