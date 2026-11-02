import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser, readDB, spaceTag, NETWORK_ERROR } from './harness.mjs'

const OK_KEY = 'k'.repeat(32)

function routesWith(spaceRespond, extra = []) {
  return [
    { match: 'app.bilibili.com/x/v2/space', respond: spaceRespond },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: 0, data: {} }) },
    ...extra,
  ]
}

function listOf(uids) {
  return uids.map((uid) => makeUser({ uid, name: `u${uid}` }))
}

test('批量检测：有 IP / 无 IP / 账号不存在 都写完并落库', async () => {
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '2') return spaceTag('')
    if (vmid === '3') return { code: -404, message: '啥都木有' }
    return spaceTag('上海')
  })
  const { app, window, document } = boot({ routes, settings: { accessKey: OK_KEY, accessKeySrc: 'manual' } })
  open(app)
  app.state.list = listOf([1, 2, 3])
  app.render()

  await app.fetchInfo('ip')

  const [a, b, c] = app.state.list
  assert.equal(a.ip, '上海')
  assert.equal(a.ipChecked, true)
  assert.ok(a.ipAt > 0)
  assert.equal(b.ip, '')
  assert.equal(b.ipChecked, true, '无 location 也要标记为已检测')
  assert.equal(c.ip, '')
  assert.equal(c.ipChecked, true, '404 账号视为已检测·无 IP')

  assert.match(document.querySelector('#bm-st').textContent, /IP 检测完成 3\/3/)

  const rows = await readDB(app)
  assert.equal(rows.length, 3)
  assert.equal(rows.find((r) => r.uid === 1).ip, '上海')
  assert.equal(rows.find((r) => r.uid === 2).ipChecked, true)

  assert.match(window.document.querySelector('tr[data-mid="1"] .bm-tags').innerHTML, /IP:上海/)
})

test('-352 风控会退避重试，重试成功后正常写入', async () => {
  let attempts = 0
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '42') {
      attempts++
      return attempts < 3 ? { code: -352, message: '风控校验失败' } : spaceTag('广东')
    }
    return spaceTag('上海')
  })
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 42 })]
  app.render()

  await app.fetchInfo('ip')

  assert.equal(attempts, 3)
  assert.equal(app.state.list[0].ip, '广东')
  assert.equal(app.state.list[0].ipChecked, true)
})

test('检测中 -101（登录失效）会中止整批、保持未检测并清掉失效 key', async () => {
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '888') return spaceTag('上海') // 授权校验可通过
    return { code: -101, message: '账号未登录' }
  })
  const { app, document, log } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = listOf([1, 2, 3])
  app.render()

  await app.fetchInfo('ip')

  assert.ok(app.state.list.every((u) => !u.ipChecked), '未完成的用户不能被标记为已检测')
  assert.match(document.querySelector('#bm-st').textContent, /已停止/)
  assert.equal(app.settings.accessKey, '', '失效后要清掉 key，避免下次静默全判“无 IP”')
  assert.ok(log.alerts.some((m) => m.includes('失效')), '应提示重新授权')
})

test('-799 请求频繁同样会重试', async () => {
  let attempts = 0
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '7') {
      attempts++
      return attempts < 2 ? { code: -799, message: '请求过于频繁' } : spaceTag('浙江')
    }
    return spaceTag('上海')
  })
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 7 })]
  app.render()
  await app.fetchInfo('ip')
  assert.equal(app.state.list[0].ip, '浙江')
})

test('网络错误只计失败，不写 ipChecked（可下次重试）', async () => {
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '5') return NETWORK_ERROR
    return spaceTag('上海')
  })
  const { app, document } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 5 }), makeUser({ uid: 6 })]
  app.render()
  await app.fetchInfo('ip')
  const broken = app.state.list.find((u) => u.uid === 5)
  assert.equal(broken.ipChecked, false, '网络失败不能标记为已检测，否则会永久“无 IP”')
  assert.equal(broken.ip, '')
  // -352/-799 之外的错误不重试，但其它用户继续
  assert.equal(app.state.list.find((u) => u.uid === 6).ip, '上海')
  assert.match(document.querySelector('#bm-st').textContent, /失败 1/)
})

test('只检测选中用户；无选中时检测当前视图', async () => {
  const seen = []
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    seen.push(vmid)
    return spaceTag('上海')
  })
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = listOf([1, 2, 3])
  app.render()

  app.state.selected = new Set([2])
  await app.fetchInfo('ip')
  assert.deepEqual(seen.filter((v) => v !== '888'), ['2'], '选中时应只检测选中项')

  seen.length = 0
  app.state.selected = new Set()
  app.render()
  await app.fetchInfo('ip')
  assert.deepEqual(seen.filter((v) => v !== '888').sort(), ['1', '2', '3'])
})

test('未授权且用户拒绝授权时不会发起检测', async () => {
  const routes = routesWith(() => spaceTag('上海'))
  const { app } = boot({ routes, confirmQueue: [true], promptQueue: [null] })
  open(app)
  app.state.list = listOf([1])
  app.render()
  await app.fetchInfo('ip')
  assert.equal(app.state.list[0].ipChecked, false)
})

test('parse() 为未检测用户补默认字段', () => {
  const { app } = boot()
  const u = app.parse({ mid: 99, uname: 'z', attribute: 0 })
  assert.equal(u.ip, '')
  assert.equal(u.ipChecked, false)
  assert.equal(u.ipAt, 0)
})

test('parse() 对已解析/旧库对象也补齐 IP 字段', () => {
  const { app } = boot()
  const old = { uid: 5, name: '旧数据', mutual: false }
  const u = app.parse(old)
  assert.equal(u, old)
  assert.equal(u.ip, '')
  assert.equal(u.ipChecked, false)
  assert.equal(u.ipAt, 0)
})
