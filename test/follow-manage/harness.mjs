// 在 jsdom 里启动 BilibiliFollowManage.js 的测试脚手架。
// 桩掉 GM_*、indexedDB、alert/confirm/prompt，并把 window.setTimeout 换成同步执行，
// 让批量检测在测试里瞬间跑完。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

export const SOURCE_PATH = join(ROOT, 'BilibiliFollowManage.js')
export const SOURCE = readFileSync(SOURCE_PATH, 'utf8')

export const sleep = (ms = 0) => new Promise((r) => setImmediate(r))

/** 轮询等待条件成立（用 setImmediate 推进，不用真实定时器） */
export async function waitFor(predicate, { tries = 400 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (predicate()) return true
    await new Promise((r) => setImmediate(r))
  }
  return false
}

export function createFakeIDB() {
  const stores = new Map()
  const storeOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    return stores.get(name)
  }
  const request = (run) => {
    const req = { result: undefined, onsuccess: null, onerror: null }
    queueMicrotask(() => {
      try {
        req.result = run()
        if (req.onsuccess) req.onsuccess({ target: req })
      } catch (error) {
        if (req.onerror) req.onerror({ target: req, error })
      }
    })
    return req
  }
  return {
    open() {
      const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null }
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: () => true },
          createObjectStore: () => ({}),
          transaction(name) {
            const data = storeOf(name)
            const tx = { oncomplete: null, onerror: null }
            tx.objectStore = () => ({
              clear: () => request(() => data.clear()),
              put: (value) => request(() => { data.set(value.uid, value); return value.uid }),
              delete: (key) => request(() => data.delete(key)),
              getAll: () => request(() => [...data.values()]),
            })
            // 用宏任务触发 oncomplete：此时 clear/put 的微任务已排空
            setImmediate(() => { if (tx.oncomplete) tx.oncomplete() })
            return tx
          },
        }
        req.result = db
        if (req.onupgradeneeded) req.onupgradeneeded({ target: req })
        if (req.onsuccess) req.onsuccess({ target: req })
      })
      return req
    },
  }
}

/**
 * @param {object} options
 * @param {string} [options.url] 页面地址（决定 this.uid）
 * @param {Array<{match: string|Function, respond: Function}>} [options.routes] GM_xmlhttpRequest 路由
 * @param {object} [options.settings] 覆盖 app.settings（如 accessKey）
 * @param {boolean[]} [options.confirmQueue] confirm 依次返回值
 * @param {(string|null)[]} [options.promptQueue] prompt 依次返回值
 */
export function boot({
  url = 'https://space.bilibili.com/888/relation/follow',
  uid = '888',
  routes = [],
  settings = {},
  confirmQueue = [],
  promptQueue = [],
  fetch: fakeFetch = null,
} = {}) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url,
    runScripts: 'outside-only',
  })
  const w = dom.window
  const log = { alerts: [], confirms: [], prompts: [], requests: [] }
  const confirms = [...confirmQueue]
  const prompts = [...promptQueue]

  w.alert = (msg) => { log.alerts.push(String(msg)) }
  w.confirm = (msg) => {
    log.confirms.push(String(msg))
    return confirms.length ? confirms.shift() : true
  }
  w.prompt = (msg) => {
    log.prompts.push(String(msg))
    return prompts.length ? prompts.shift() : null
  }

  // 同步执行定时器：批量检测/退避等待在测试里不阻塞
  w.setTimeout = (fn) => { fn(); return 1 }
  w.clearTimeout = () => {}

  w.GM_addStyle = () => {}
  w.indexedDB = createFakeIDB()
  w.GM_xmlhttpRequest = (opts) => {
    const requestUrl = String(opts.url || '')
    log.requests.push({ url: requestUrl, method: opts.method, data: opts.data, headers: opts.headers })
    const route = routes.find((r) => (typeof r.match === 'function' ? r.match(requestUrl) : requestUrl.includes(r.match)))
    if (!route) {
      queueMicrotask(() => { if (opts.onerror) opts.onerror({}) })
      return
    }
    let payload
    try {
      payload = route.respond(requestUrl, opts, log)
    } catch (error) {
      queueMicrotask(() => { if (opts.onerror) opts.onerror(error) })
      return
    }
    if (payload === NETWORK_ERROR) {
      queueMicrotask(() => { if (opts.onerror) opts.onerror({}) })
      return
    }
    queueMicrotask(() => {
      if (!opts.onload) return
      opts.onload({ status: 200, responseText: typeof payload === 'string' ? payload : JSON.stringify(payload) })
    })
  }

  // 真实页面上 uid 来自 DedeUserID cookie（pathname 是 /<uid>/relation/follow，不含 space/）
  if (uid) w.document.cookie = `DedeUserID=${uid}`

  // 只有测试/探针环境才允许脚本把 App 实例挂到 window（发布版不暴露 access_key）
  w.__BM_TEST__ = true
  if (fakeFetch) w.fetch = fakeFetch
  w.eval(SOURCE)
  // 脚本是 @run-at document-start 语义：jsdom 构造期间 readyState 仍为 loading，
  // 手动补发一次 DOMContentLoaded 触发面板初始化（监听器是一次性的，不会重复建）
  if (!w.__BM_APP) w.document.dispatchEvent(new w.Event('DOMContentLoaded'))

  const app = w.__BM_APP
  if (!app) throw new Error('脚本没有暴露 window.__BM_APP（测试钩子丢失？）')
  if (settings && Object.keys(settings).length) {
    Object.assign(app.settings, settings)
    app.saveSettings()
  }
  return { dom, window: w, app, log, document: w.document }
}

export const NETWORK_ERROR = Symbol('network-error')

/** 初始化 UI 并让面板处于"打开"状态（fetchInfo 的停止守卫依赖它） */
export function open(app) {
  app.initUI()
  app.ui.style.display = 'flex'
  return app
}

/** 直接读 IndexedDB 里的关注数据 */
export function readDB(app) {
  return new Promise((resolve) => {
    const req = app.db.transaction('follows', 'readonly').objectStore('follows').getAll()
    req.onsuccess = () => resolve(req.result)
  })
}

/** 构造一个"已解析"的用户对象（与 parse() 输出同构） */
export function makeUser(over = {}) {
  return {
    uid: 1,
    name: '测试用户',
    face: '',
    sign: '',
    fans: 100,
    followTime: 0,
    videoTime: 0,
    dynamicTime: 0,
    groups: [],
    mutual: false,
    special: false,
    contract: false,
    org: false,
    desc: '',
    vip: '',
    ip: '',
    ipChecked: false,
    ipAt: 0,
    oldFan: false,
    oldFanDisplay: false,
    oldFanChecked: false,
    oldFanAt: 0,
    ...over,
  }
}

export function spaceTag(location, extra = []) {
  return { code: 0, message: 'OK', data: { card: { space_tag: [...(location ? [{ type: 'location', title: location }] : []), ...extra], space_tag_bottom: [] } } }
}
