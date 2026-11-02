import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boot, open, makeUser } from './harness.mjs'

test('有 IP 的用户行内出现 IP:属地 标签，无 IP 不出现', () => {
  const { app, window } = boot()
  open(app)
  app.state.list = [
    makeUser({ uid: 1, name: '甲', ip: '上海', ipChecked: true }),
    makeUser({ uid: 2, name: '乙', ip: '', ipChecked: true }),
  ]
  app.render()

  const doc = window.document
  const cell1 = doc.querySelector('tr[data-mid="1"] .bm-tags')
  assert.ok(cell1, '缺少 .bm-tags 容器')
  assert.match(cell1.innerHTML, /class="bm-tag t-ip"/)
  assert.match(cell1.innerHTML, /IP:上海/)
  assert.doesNotMatch(doc.querySelector('tr[data-mid="2"] .bm-tags').innerHTML, /IP:/)
})

test('setRowTags 只刷新标签、不重绘整表', () => {
  const { app, window } = boot()
  open(app)
  app.state.list = [makeUser({ uid: 1, name: '甲' }), makeUser({ uid: 2, name: '乙' })]
  app.render()

  const doc = window.document
  const before = doc.querySelector('tr[data-mid="1"]')
  app.state.list[0].ip = '北京'
  app.state.list[0].ipChecked = true
  app.setRowTags(app.state.list[0])
  const after = doc.querySelector('tr[data-mid="1"]')
  assert.equal(before, after, '不应该替换整行节点')
  assert.match(after.querySelector('.bm-tags').innerHTML, /IP:北京/)
  // 其它行不受影响
  assert.doesNotMatch(doc.querySelector('tr[data-mid="2"] .bm-tags').innerHTML, /IP:/)
})

test('互关 / 原始粉丝 / 分组标签在重构后仍然正确', () => {
  const { app, window } = boot()
  open(app)
  app.state.groups = { 5: '同学' }
  app.state.list = [
    makeUser({ uid: 1, name: '甲', mutual: true, contract: true, groups: [-10, 5] }),
  ]
  app.render()
  const html = window.document.querySelector('tr[data-mid="1"] .bm-tags').innerHTML
  assert.match(html, /互相关注/)
  assert.match(html, /原始粉丝/)
  assert.match(html, /特别关注/)
  assert.match(html, /同学/)
})

test('tagHtml 生成合法标签', () => {
  const { app } = boot()
  assert.equal(app.tagHtml('t-ip', 'IP:上海'), '<span class="bm-tag t-ip">IP:上海</span>')
})
