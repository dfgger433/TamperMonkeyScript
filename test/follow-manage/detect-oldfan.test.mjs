import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser, readDB, waitFor } from './harness.mjs'

const WBI = {
  wbi_img: {
    img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
    sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png',
  },
}

function routesWith(accInfo) {
  return [
    { match: 'x/web-interface/nav', respond: () => ({ code: 0, data: WBI }) },
    { match: 'x/space/wbi/acc/info', respond: accInfo },
  ]
}

const contract = (follow, display = false) => ({ code: 0, data: { contract: { is_follow_display: follow, is_display: display } } })

function listOf(uids) {
  return uids.map((uid) => makeUser({ uid, name: `u${uid}` }))
}

test('批量检测：is_follow_display 写入 oldFan / oldFanDisplay 并打标签', async () => {
  const routes = routesWith((url) => {
    const mid = /mid=(\d+)/.exec(url)?.[1]
    if (mid === '1') return contract(true, true)
    return contract(false, false)
  })
  const { app, window } = boot({ routes })
  open(app)
  app.state.list = listOf([1, 2])
  app.render()

  await app.fetchInfo('oldfan')

  const [a, b] = app.state.list
  assert.equal(a.oldFan, true)
  assert.equal(a.oldFanDisplay, true)
  assert.equal(a.oldFanChecked, true)
  assert.ok(a.oldFanAt > 0)
  assert.equal(b.oldFan, false)
  assert.equal(b.oldFanChecked, true)

  const tags1 = window.document.querySelector('tr[data-mid="1"] .bm-tags').innerHTML
  assert.match(tags1, /t-oldfan/)
  assert.match(tags1, /老粉计划/)
  assert.doesNotMatch(window.document.querySelector('tr[data-mid="2"] .bm-tags').innerHTML, /老粉计划/)

  const rows = await readDB(app)
  assert.equal(rows.find((r) => r.uid === 1).oldFan, true)
  assert.equal(rows.find((r) => r.uid === 1).oldFanChecked, true)
})

test('响应缺少 contract 时按失败处理，不写成「无老粉计划」', async () => {
  const routes = routesWith(() => ({ code: 0, data: {} }))
  const { app, document } = boot({ routes })
  open(app)
  app.state.list = listOf([4])
  app.render()

  await app.fetchInfo('oldfan')

  assert.equal(app.state.list[0].oldFanChecked, false)
  assert.equal(app.state.list[0].oldFan, false)
  assert.match(document.querySelector('#bm-st').textContent, /失败 1/)
})

test('-352 风控会退避重试，重试成功后写入', async () => {
  let attempts = 0
  const routes = routesWith(() => {
    attempts++
    return attempts < 3 ? { code: -352, message: '风控校验失败' } : contract(true)
  })
  const { app } = boot({ routes })
  open(app)
  app.state.list = listOf([5])
  app.render()

  await app.fetchInfo('oldfan')

  assert.equal(attempts, 3)
  assert.equal(app.state.list[0].oldFan, true)
  assert.equal(app.state.list[0].oldFanChecked, true)
})

test('-404 账不存在：记已检测·无老粉计划', async () => {
  const routes = routesWith(() => ({ code: -404, message: '啥都木有' }))
  const { app, document } = boot({ routes })
  open(app)
  app.state.list = listOf([6])
  app.render()

  await app.fetchInfo('oldfan')

  assert.equal(app.state.list[0].oldFan, false)
  assert.equal(app.state.list[0].oldFanChecked, true)
  assert.ok(app.state.list[0].oldFanAt > 0)
  assert.doesNotMatch(document.querySelector('#bm-st').textContent, /失败/)
})

test('点击「老粉计划」按钮走 fetchInfo(oldfan)', async () => {
  const routes = routesWith(() => contract(true))
  const { app, window } = boot({ routes })
  open(app)
  app.state.list = listOf([7])
  app.render()

  const calls = []
  const original = app.fetchInfo.bind(app)
  app.fetchInfo = (t) => { calls.push(t); return original(t) }

  window.document.querySelector('#bm-btn-fetch-oldfan').click()
  assert.ok(await waitFor(() => calls.length > 0 && app.state.busy === false && app.state.list[0].oldFanChecked))
  assert.deepEqual(calls, ['oldfan'])
  assert.equal(app.state.list[0].oldFan, true)
})

test('未选中时检测当前视图；选中时只检测选中项', async () => {
  const seen = []
  const routes = routesWith((url) => {
    seen.push(/mid=(\d+)/.exec(url)?.[1])
    return contract(false)
  })
  const { app } = boot({ routes })
  open(app)
  app.state.list = listOf([1, 2, 3])
  app.render()

  app.state.selected = new Set([2])
  await app.fetchInfo('oldfan')
  assert.deepEqual(seen, ['2'])

  seen.length = 0
  app.state.selected = new Set()
  app.render()
  await app.fetchInfo('oldfan')
  assert.deepEqual(seen.sort(), ['1', '2', '3'])
})

test('老粉计划检测带 wbi 签名与空 token（与网页端一致）', async () => {
  const requests = []
  const routes = routesWith((url) => {
    requests.push(url)
    return contract(false)
  })
  const { app } = boot({ routes })
  open(app)
  app.state.list = listOf([8])
  app.render()
  await app.fetchInfo('oldfan')
  const url = requests[0]
  assert.match(url, /mid=8/)
  assert.match(url, /platform=web/)
  assert.match(url, /web_location=1550101/)
  assert.match(url, /token=/)
  assert.match(url, /w_rid=/)
})
