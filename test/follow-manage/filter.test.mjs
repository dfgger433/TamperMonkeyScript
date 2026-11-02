import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser } from './harness.mjs'

function freshList() {
  return [
    makeUser({ uid: 1, name: '有IP', ip: '上海', ipChecked: true, ipAt: 1 }),
    makeUser({ uid: 2, name: '无IP', ip: '', ipChecked: true, ipAt: 2 }),
    makeUser({ uid: 3, name: '未检测', ip: '', ipChecked: false }),
  ]
}

test('IP属地 三态：未检测既不匹配「有」也不匹配「无」', () => {
  const { app } = boot()
  open(app)
  app.state.list = freshList()
  app.render()

  app.state.conds = [{ t: 'stat', v: 'ip', op: true, l: '有IP属地' }]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [1])

  app.state.conds = [{ t: 'stat', v: 'ip', op: false, l: '无IP属地' }]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [2], '未检测用户不能被当成“无 IP”')

  app.state.conds = []
  app.render()
  assert.equal(app.view.length, 3)
})

test('老粉计划 三态：未检测两边都不匹配', () => {
  const { app } = boot()
  open(app)
  app.state.list = [
    makeUser({ uid: 1, name: '有老粉', oldFan: true, oldFanChecked: true, oldFanAt: 1 }),
    makeUser({ uid: 2, name: '无老粉', oldFan: false, oldFanChecked: true, oldFanAt: 2 }),
    makeUser({ uid: 3, name: '未检测' }),
  ]
  app.render()

  app.state.conds = [{ t: 'stat', v: 'oldfan', op: true, l: '有老粉计划' }]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [1])

  app.state.conds = [{ t: 'stat', v: 'oldfan', op: false, l: '无老粉计划' }]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [2])

  app.state.conds = []
  app.render()
  assert.equal(app.view.length, 3)
})

test('IP 与老粉计划条件可叠加', () => {
  const { app } = boot()
  open(app)
  app.state.list = [
    makeUser({ uid: 1, ip: '上海', ipChecked: true, oldFan: true, oldFanChecked: true }),
    makeUser({ uid: 2, ip: '北京', ipChecked: true, oldFan: false, oldFanChecked: true }),
    makeUser({ uid: 3, ip: '', ipChecked: true, oldFan: true, oldFanChecked: true }),
  ]
  app.state.conds = [
    { t: 'stat', v: 'ip', op: true, l: '有IP属地' },
    { t: 'stat', v: 'oldfan', op: true, l: '有老粉计划' },
  ]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [1])
})

test('IP属地 条件与其它条件可叠加', () => {
  const { app } = boot()
  open(app)
  app.state.list = freshList()
  app.render()
  app.state.conds = [
    { t: 'stat', v: 'ip', op: true, l: '有IP属地' },
    { t: 'fans', op: '>=', v: 50, l: '粉丝数 ≥ 50' },
  ]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [1])

  app.state.conds = [
    { t: 'stat', v: 'ip', op: true, l: '有IP属地' },
    { t: 'fans', op: '>=', v: 500, l: '粉丝数 ≥ 500' },
  ]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [])
})

test('搜索词与 IP 条件叠加不报错', () => {
  const { app, window } = boot()
  open(app)
  app.state.list = freshList()
  window.document.querySelector('#bm-k').value = '有'
  app.state.conds = [{ t: 'stat', v: 'ip', op: true, l: '有IP属地' }]
  app.render()
  assert.deepEqual(app.view.map((u) => u.uid), [1])
})
