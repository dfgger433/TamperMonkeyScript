import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, spaceTag } from './harness.mjs'

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'

test('parseAccessKey 支持纯 key / JSON / 存储片段', () => {
  const { app } = boot()
  assert.equal(app.parseAccessKey(KEY), KEY)
  assert.equal(app.parseAccessKey(`  ${KEY}  `), KEY)
  assert.equal(app.parseAccessKey(JSON.stringify({ aceess_key: KEY })), KEY)
  assert.equal(app.parseAccessKey(JSON.stringify({ access_key: KEY })), KEY)
  assert.equal(app.parseAccessKey(`aceess_key: "${KEY}"`), KEY)
  assert.equal(app.parseAccessKey(''), '')
  assert.equal(app.parseAccessKey(null), '')
})

test('validateAccessKey：本人主页有 location 即判定有效', async () => {
  const routes = [{ match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('上海') }]
  const { app } = boot({ routes })
  open(app)
  assert.equal(await app.validateAccessKey(KEY), true)
})

test('validateAccessKey：history 返回 -101 判定无效', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: -101, message: '账号未登录' }) },
  ]
  const { app } = boot({ routes })
  open(app)
  assert.equal(await app.validateAccessKey(KEY), false)
})

test('validateAccessKey：history 正常即判定有效', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: 0, data: { list: [] } }) },
  ]
  const { app } = boot({ routes })
  open(app)
  assert.equal(await app.validateAccessKey(KEY), true)
})

test('validateAccessKey：接口异常时返回 unknown（不误判为失效）', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: -400, message: '请求错误' }) },
  ]
  const { app } = boot({ routes })
  open(app)
  assert.equal(await app.validateAccessKey(KEY), 'unknown')
})

test('手动粘贴：校验通过后保存来源为 manual', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('上海') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: 0 }) },
  ]
  const { app, window } = boot({
    routes,
    confirmQueue: [true],
    promptQueue: [JSON.stringify({ aceess_key: KEY })],
  })
  open(app)
  assert.equal(await app.ensureAccessKey(), true)
  assert.equal(app.settings.accessKey, KEY)
  assert.equal(app.settings.accessKeySrc, 'manual')
  assert.match(window.document.querySelector('#bm-ip-auth').textContent, /已授权/)
})

test('手动粘贴：校验失败不保存', async () => {
  const routes = [
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('') },
    { match: 'app.bilibili.com/x/v2/history', respond: () => ({ code: -101 }) },
  ]
  const { app } = boot({ routes, confirmQueue: [true], promptQueue: [KEY] })
  open(app)
  assert.equal(await app.ensureAccessKey(), false)
  assert.equal(app.settings.accessKey, '')
})

test('自动授权：auth_code → confirm → poll 三步后保存来源为 tv', async () => {
  const routes = [
    { match: 'passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', respond: () => ({ code: 0, data: { auth_code: 'AC' } }) },
    { match: 'passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm', respond: () => ({ code: 0, data: { gourl: '' } }) },
    { match: 'passport.bilibili.com/x/passport-tv-login/qrcode/poll', respond: () => ({ code: 0, data: { access_token: 'TOKEN123' } }) },
    { match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('上海') },
  ]
  const { app, window, log } = boot({ routes, confirmQueue: [false, true] })
  open(app)
  window.document.cookie = 'bili_jct=csrf123'
  assert.equal(await app.ensureAccessKey(), true)
  assert.equal(app.settings.accessKey, 'TOKEN123')
  assert.equal(app.settings.accessKeySrc, 'tv')
  assert.ok(log.requests.some((r) => r.url.includes('/qrcode/auth_code')))
  assert.ok(log.requests.some((r) => r.url.includes('/h5/qrcode/confirm')))
  assert.ok(log.requests.some((r) => r.url.includes('/qrcode/poll')))
})

test('自动授权：未登录（无 bili_jct）时报错且不保存', async () => {
  const routes = [
    { match: 'passport.bilibili.com/x/passport-tv-login/qrcode/auth_code', respond: () => ({ code: 0, data: { auth_code: 'AC' } }) },
  ]
  const { app, log } = boot({ routes, confirmQueue: [false, true] })
  open(app)
  assert.equal(await app.ensureAccessKey(), false)
  assert.equal(app.settings.accessKey, '')
  assert.ok(log.alerts.some((m) => m.includes('获取授权失败')))
})

test('已授权时点「IP授权」可清除', async () => {
  const routes = [{ match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('上海') }]
  const { app, window } = boot({
    routes,
    settings: { accessKey: KEY, accessKeySrc: 'manual' },
    confirmQueue: [true],
  })
  open(app)
  await app.manageAccessKey()
  assert.equal(app.settings.accessKey, '')
  assert.match(window.document.querySelector('#bm-ip-auth').textContent, /未授权/)
})

test('已授权且有效时 ensureAccessKey 不再弹窗', async () => {
  const routes = [{ match: 'app.bilibili.com/x/v2/space', respond: () => spaceTag('上海') }]
  const { app, log } = boot({ routes, settings: { accessKey: KEY, accessKeySrc: 'manual' } })
  open(app)
  assert.equal(await app.ensureAccessKey(), true)
  assert.equal(log.confirms.length, 0)
})
