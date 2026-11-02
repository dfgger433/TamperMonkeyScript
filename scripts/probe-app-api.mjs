// 真实接口探针：不需要登录，用来回归「App 端签名 / TV 授权入口 / IP 属地读取」链路。
// 用法：node scripts/probe-app-api.mjs
// 说明：匿名请求拿到的 space_tag 里本来就不会有 location（必须带 access_key），
//       所以这里断言的是「签名正确、接口可达、返回 code 0」，而不是真能读到 IP。
import { JSDOM } from 'jsdom'
import { createFakeIDB, SOURCE } from '../test/follow-manage/harness.mjs'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://space.bilibili.com/2/relation/follow',
  runScripts: 'outside-only',
})
const w = dom.window
w.GM_addStyle = () => {}
w.indexedDB = createFakeIDB()
w.setTimeout = (fn) => { fn(); return 1 }
w.clearTimeout = () => {}
w.alert = () => {}
w.confirm = () => false
w.prompt = () => null
w.document.cookie = 'DedeUserID=2'
w.__BM_TEST__ = true
w.GM_xmlhttpRequest = (opts) => {
  fetch(opts.url, { method: opts.method || 'GET', headers: opts.headers, body: opts.data })
    .then(async (r) => {
      const text = await r.text()
      if (opts.onload) opts.onload({ status: r.status, responseText: text })
    })
    .catch((e) => { if (opts.onerror) opts.onerror(e) })
}
w.eval(SOURCE)
const app = w.__BM_APP

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`)
}

// 1) 匿名 app 空间接口：签名要是对的，才可能 code 0
let anonymousCode = null
try {
  const dbg = w.__BM_DEBUG
  const signed = dbg.signParam(
    `access_key=&appkey=${dbg.APP_KEY}&build=${dbg.APP_BUILD}&mobi_app=android&platform=android&vmid=2`,
    dbg.APP_SEC,
  )
  const res = await fetch(`https://app.bilibili.com/x/v2/space?${signed}`, {
    headers: { 'user-agent': dbg.APP_UA, buvid: 'XX' + '0'.repeat(32) },
  })
  const json = await res.json()
  anonymousCode = json.code
  check('app/x/v2/space 签名请求返回 code=0', json.code === 0, `code=${json.code}`)
} catch (e) {
  check('app/x/v2/space 签名请求返回 code=0', false, String(e))
}

// 2) 脚本自己的 fetchIpLocation（匿名）能跑通解析，且没有 location
try {
  const loc = await app.fetchIpLocation(2, '')
  check('fetchIpLocation 匿名解析成功且无 location', loc === '', JSON.stringify(loc))
} catch (e) {
  check('fetchIpLocation 匿名解析成功且无 location', false, String(e))
}

// 3) 假 access_key 仍 code 0 —— 证明"不能靠返回码校验 key"
try {
  const loc = await app.fetchIpLocation(2, 'deadbeefdeadbeefdeadbeefdeadbeef')
  check('假 access_key 不会被返回码识破（必须靠 location/历史接口）', loc === '', JSON.stringify(loc))
} catch (e) {
  check('假 access_key 不会被返回码识破（必须靠 location/历史接口）', false, String(e))
}

// 4) TV 登录 auth_code 入口可达（拿到 auth_code 即说明签名正确）
try {
  const dbg = w.__BM_DEBUG
  const body = await new Promise((resolve, reject) => {
    const buvid = app.appBuvid()
    const loginQuery = `appkey=${dbg.LOGIN_APP_KEY}&build=${dbg.APP_BUILD}&c_locale=zh-Hans_CN&channel=website&local_id=${buvid}&mobi_app=android&platform=android&s_locale=zh-Hans_CN`
    const sign = dbg.signParam(loginQuery, dbg.LOGIN_APP_SEC)
    w.GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code',
      data: sign,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'user-agent': dbg.APP_UA, buvid },
      onload: (r) => resolve(r.responseText),
      onerror: reject,
    })
  })
  const json = JSON.parse(body)
  check('passport TV auth_code 入口可达', json.code === 0 && !!json.data?.auth_code, `code=${json.code}`)
} catch (e) {
  check('passport TV auth_code 入口可达', false, String(e))
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 通过`)
process.exit(failed.length ? 1 : 0)
