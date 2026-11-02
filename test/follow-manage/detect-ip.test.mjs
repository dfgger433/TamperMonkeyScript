import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser, readDB, spaceTag, NETWORK_ERROR, waitFor } from './harness.mjs'

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

test('act() 的 fetch-* 路由：fans / dyn / ip / oldfan 都进 fetchInfo', async () => {
  const { app } = boot()
  open(app)
  const seen = []
  app.fetchInfo = async (t) => { seen.push(t) }
  await app.act('fetch-fans')
  await app.act('fetch-dyn')
  await app.act('fetch-ip')
  await app.act('fetch-oldfan')
  assert.deepEqual(seen, ['fans', 'dyn', 'ip', 'oldfan'])
})

test('点击「IP属地」按钮真的走检测（回归：曾误入关注/取关分支）', async () => {
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    return vmid === '1' ? spaceTag('江苏') : spaceTag('上海')
  })
  const { app, window, log } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲' })]
  app.render()
  app.state.selected = new Set([1]) // 旧 bug 下会走 confirm + batch/modify

  const calls = []
  const original = app.fetchInfo.bind(app)
  app.fetchInfo = (t) => { calls.push(t); return original(t) }

  window.document.querySelector('#bm-btn-fetch-ip').click()
  assert.ok(await waitFor(() => calls.length > 0 && app.state.busy === false && app.state.list[0].ipChecked), '检测没有跑起来/没写结果')

  assert.deepEqual(calls, ['ip'])
  assert.equal(app.state.list[0].ip, '江苏')
  assert.ok(!log.requests.some((r) => /x\/relation\/(batch\/)?modify/.test(r.url)), '绝不能发起关注/取关请求')
  assert.ok(!log.confirms.some((m) => /取关|关注 \d/.test(m)), '不能弹关注/取关确认')
})

test('无法验证 key（unknown）时拒绝继续：不发检测请求、不清 key', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: -400, message: '请求错误' }) },
  ]
  const { app, log } = boot({ routes, settings: { accessKey: OK_KEY }, confirmQueue: [false] })
  open(app)
  app.state.list = [makeUser({ uid: 1 })]
  app.render()

  await app.fetchInfo('ip')

  assert.equal(app.state.list[0].ipChecked, false)
  assert.equal(log.requests.filter((r) => /vmid=1\b/.test(r.url)).length, 0, '拒绝后不能发起检测')
  assert.equal(app.settings.accessKey, OK_KEY, '只是无法验证，不应清掉 key')
  assert.ok(log.confirms.some((m) => m.includes('无 IP')), '应提示误判风险')
})

test('检测中途 key 被清：后续任务停止，且请求始终带批次开始时的 key', async () => {
  let appRef
  let first = true
  const seenKeys = []
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '888') return spaceTag('上海')
    seenKeys.push(/access_key=([^&]*)/.exec(url)?.[1])
    if (first) { first = false; appRef.settings.accessKey = ''; return spaceTag('四川') }
    return spaceTag('北京')
  })
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  appRef = app
  open(app)
  app.state.list = [1, 2, 3].map((uid) => makeUser({ uid, name: 'u' + uid }))
  app.render()

  await app.fetchInfo('ip')

  assert.ok(seenKeys.length >= 1)
  assert.ok(seenKeys.every((k) => k === OK_KEY), '每条请求都必须带原 key，不能用空 key')
  assert.equal(app.state.list[0].ip, '四川')
  assert.equal(app.state.list[2].ipChecked, false, 'key 变更后排队中的任务不能再写')
})

test('响应缺少 card 时按失败处理，不写成「无 IP」', async () => {
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '4') return { code: 0, message: 'OK', data: {} }
    return spaceTag('上海')
  })
  const { app, document } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 4 })]
  app.render()

  await app.fetchInfo('ip')

  assert.equal(app.state.list[0].ipChecked, false)
  assert.match(document.querySelector('#bm-st').textContent, /失败 1/)
})

test('授权期间列表被同步替换：按 uid 重新解析，不会整批空跑', async () => {
  let appRef
  const routes = routesWith((url) => {
    const vmid = /vmid=(\d+)/.exec(url)?.[1]
    if (vmid === '888') {
      // 模拟 show() 里 syncData 完成：state.list 被替换成一批新对象
      appRef.state.list = appRef.state.list.map((u) => ({ ...u }))
      appRef.render()
      return spaceTag('上海')
    }
    return spaceTag('北京')
  })
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  appRef = app
  open(app)
  app.state.list = [makeUser({ uid: 1 }), makeUser({ uid: 2 })]
  app.render()

  await app.fetchInfo('ip')

  assert.equal(app.state.list[0].ipChecked, true, '替换后的新对象也要被检测')
  assert.equal(app.state.list[0].ip, '北京')
  assert.equal(app.state.list[1].ip, '北京')
  assert.ok(app.state.list.every((u) => u.ipChecked))
})

test('连点两次不会跑两轮并发检测', async () => {
  let spaceCalls = 0
  const routes = routesWith(() => { spaceCalls++; return spaceTag('上海') })
  const { app, log } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [makeUser({ uid: 1 }), makeUser({ uid: 2 })]
  app.render()

  const first = app.fetchInfo('ip')
  const second = app.fetchInfo('ip') // 授权中再点：应被挡住而不是开第二轮
  await Promise.all([first, second])

  assert.equal(spaceCalls, 3, '应为 1 次校验 + 2 次检测，不能翻倍')
  assert.ok(app.state.list.every((u) => u.ipChecked))
  assert.ok(log.requests.length >= 3)
})

test('整批 0 属地时提示可能授权失效', async () => {
  const routes = routesWith(() => spaceTag(''))
  const { app, log } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = [1, 2, 3, 4, 5].map((uid) => makeUser({ uid }))
  app.render()

  await app.fetchInfo('ip')

  assert.ok(log.alerts.some((m) => m.includes('没有取到任何 IP 属地')))
  assert.ok(app.state.list.every((u) => u.ipChecked && u.ip === ''))
})

test('批次中途 canary 探测到 -101 会中止并清 key', async () => {
  let historyCalls = 0
  const routes = [
    {
      match: 'app.bilibili.com/x/v2/space',
      respond: (url) => (/vmid=888\b/.test(url) ? spaceTag('') : spaceTag('上海')),
    },
    {
      match: 'app.bilibili.com/x/v2/history',
      respond: () => (++historyCalls === 1 ? { code: 0 } : { code: -101, message: '账号未登录' }),
    },
  ]
  const { app } = boot({ routes, settings: { accessKey: OK_KEY } })
  open(app)
  app.state.list = Array.from({ length: 30 }, (_, i) => makeUser({ uid: i + 1 }))
  app.render()

  await app.fetchInfo('ip')

  assert.ok(historyCalls >= 2, '应触发 canary')
  assert.equal(app.settings.accessKey, '', 'canary 失败后要清掉 key')
  assert.ok(app.state.list.some((u) => !u.ipChecked), '已中止，不能全部写完')
})

test('列表为空/未渲染时点检测不抛 TypeError', async () => {
  const { app, log } = boot()
  open(app)
  await app.fetchInfo('fans')
  assert.ok(log.alerts.some((m) => m.includes('列表为空')))
  assert.equal(app.state.busy, false)
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
