import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open } from './harness.mjs'

test('状态下拉包含「IP属地」与「老粉计划」选项', () => {
  const { app, window } = boot()
  open(app)
  const ip = window.document.querySelector('#bm-s-stat option[value="ip"]')
  const old = window.document.querySelector('#bm-s-stat option[value="oldfan"]')
  assert.ok(ip, '状态筛选里缺少 value=ip 的选项')
  assert.equal(ip.textContent, 'IP属地')
  assert.ok(old, '状态筛选里缺少 value=oldfan 的选项')
  assert.equal(old.textContent, '老粉计划')
  // 原有选项不能丢
  for (const value of ['', 'mutual', 'special', 'contract', 'die']) {
    assert.ok(window.document.querySelector(`#bm-s-stat option[value="${value}"]`), `缺少原有选项 ${value}`)
  }
})

test('选中「IP属地」生成「有IP属地」，切「非」后生成「无IP属地」', () => {
  const { app, window } = boot()
  open(app)
  const doc = window.document
  const select = doc.querySelector('#bm-s-stat')

  select.value = 'ip'
  select.dispatchEvent(new window.Event('change'))
  assert.equal(app.state.conds.length, 1)
  assert.deepEqual(
    { t: app.state.conds[0].t, v: app.state.conds[0].v, op: app.state.conds[0].op, l: app.state.conds[0].l },
    { t: 'stat', v: 'ip', op: true, l: '有IP属地' },
  )
  assert.match(doc.querySelector('#bm-conds').textContent, /有IP属地/)

  doc.querySelector('#bm-s-stat-op').click() // 是 → 非
  assert.equal(doc.querySelector('#bm-s-stat-op').textContent, '非')

  select.value = 'ip'
  select.dispatchEvent(new window.Event('change'))
  assert.equal(app.state.conds.length, 2)
  assert.equal(app.state.conds[1].l, '无IP属地')
  assert.equal(app.state.conds[1].op, false)
  assert.match(doc.querySelector('#bm-conds').textContent, /无IP属地/)
})

test('选中「老粉计划」生成「有老粉计划」，切「非」后生成「无老粉计划」', () => {
  const { app, window } = boot()
  open(app)
  const doc = window.document
  const select = doc.querySelector('#bm-s-stat')

  select.value = 'oldfan'
  select.dispatchEvent(new window.Event('change'))
  assert.equal(app.state.conds[0].l, '有老粉计划')
  assert.equal(app.state.conds[0].v, 'oldfan')
  assert.equal(app.state.conds[0].op, true)

  doc.querySelector('#bm-s-stat-op').click()
  select.value = 'oldfan'
  select.dispatchEvent(new window.Event('change'))
  assert.equal(app.state.conds[1].l, '无老粉计划')
  assert.equal(app.state.conds[1].op, false)
})

test('旧的「互关/老粉/已注销」文案保持不变', () => {
  const { app, window } = boot()
  open(app)
  const doc = window.document
  const select = doc.querySelector('#bm-s-stat')
  select.value = 'die'
  select.dispatchEvent(new window.Event('change'))
  assert.equal(app.state.conds[0].l, '状态 是 已注销')
})

test('面板里有「IP属地」「老粉计划」检测按钮和「IP授权」入口', () => {
  const { app, window } = boot()
  open(app)
  const doc = window.document
  assert.equal(doc.querySelector('#bm-btn-fetch-ip').textContent, 'IP属地')
  assert.equal(doc.querySelector('#bm-btn-fetch-oldfan').textContent, '老粉计划')
  assert.equal(doc.querySelector('#bm-ip-auth').textContent, 'IP授权: 未授权')
})
