# 任务清单 · IP 属地 / 老粉计划检测

> 基线 `1.0.0`（`6f64cf1`）；分支 `feat/ip-oldfan-detect`。
> 状态标记：`[ ]` 待做、`[x]` 完成、`[!]` 阻塞/等待确认、`[-]` 取消（附原因）。
> 阶段 1 已在本机执行完毕，勾选以实际命令结果为准（见 `PLAN.md` §9、`TESTING.md` §1）。

## 0. 准备与核对

- [x] 确认分支为 `feat/ip-oldfan-detect`，从 `origin/main` 拉出
- [x] 核对基线：`BilibiliFollowManage.js` 51457 字节、md5 `4e239f41ae0baf0541f65b3ecc683e52`
- [x] 确认 `origin` 指向 `https://github.com/dfgger433/TamperMonkeyScript.git`
- [x] 记录 1.0.0 发布版位置：`H:\资源\js脚本\bilibili.com\BiliBili 关注管理-1.0.0.user.js`
- [x] 把工作区行尾统一为 LF（仓库 `core.autocrlf=false`，避免整文件 diff）

## 1. 文档

- [x] `docs/bili-follow-manage/PLAN.md`
- [x] `docs/bili-follow-manage/RESEARCH.md`
- [x] `docs/bili-follow-manage/TESTING.md`
- [x] `docs/bili-follow-manage/MANUAL-TEST.md`
- [x] `docs/bili-follow-manage/TASKS.md`
- [x] 文档内路径、命令、行号复核（测试命令改 glob、`dist` 入库口径）

## 2. 代码：头部与常量

- [x] `@version` 改 `1.1.4`
- [x] `@description` 追加「主页 IP 属地检测」
- [x] 新增 `@connect app.bilibili.com`
- [x] 新增 `@connect passport.bilibili.com`
- [x] 确认未新增 `@grant`
- [x] `encWbi` 后加 `APP_KEY/APP_SEC/LOGIN_APP_KEY/LOGIN_APP_SEC/APP_BUILD/APP_UA`
- [x] 加 `genBuvid()`
- [x] 加 `signParam(params, sec)`：排序 + `ts` + md5
- [x] CSS 加 `.t-ip` 与 `.bm-tags`

## 3. 代码：授权（access_key）

- [x] `parseAccessKey(raw)`：支持裸串 / JSON（`aceess_key`、`access_key`）/ 文本片段（不做十六进制强校验，兼容特殊字符）
- [x] `setAccessKey(key, src)`：写 `accessKey/accessKeySrc/accessKeyAt`
- [x] `validateAccessKey(key)`：本人主页能取到 `location` 才算有效；辅以 `x/v2/history -101`；异常返回 `'unknown'` 不误判
- [x] `acquireAccessKey()`：`qrcode/auth_code` → `h5/qrcode/confirm`（带 `csrf`）→ `qrcode/poll`
- [x] 首次自动授权前提示「可能导致网页端掉线」
- [x] `manageAccessKey()`：查看状态、清除、重新引导
- [x] `ensureAccessKey()`：优先引导复制 `aceess_key`，失败/拒绝再走 TV 授权
- [x] `updateAuthLabel()`：`IP授权: 未授权/已授权`（失效时清空并回到未授权）
- [x] 清除授权时同步清 `accessKeySrc/accessKeyAt`，并刷新标签

## 4. 代码：UI 与绑定

- [x] 状态下拉加 `<option value="ip">IP属地</option>`
- [x] 动作栏「动态」后加 `#bm-btn-fetch-ip`
- [x] 子栏「清空缓存」后加 `#bm-ip-auth`
- [x] 绑定 `#bm-btn-fetch-ip` → `act('fetch-ip')`（沿用 `t.split('-')[1]`）
- [x] 绑定 `#bm-ip-auth` → `manageAccessKey()`
- [x] 复用 `addCondOnChange('stat')`，未另写下拉逻辑
- [x] 检测中按钮文案「停止」，结束后恢复

## 5. 代码：筛选与标签

- [x] `addCond` 对 `stat=ip` 特判 chip：`有IP属地` / `无IP属地`（其它选项文案不变）
- [x] `render()` 的 `stat` 分支加三态：`!ipChecked` 两边都不匹配
- [x] 「有」= `ipChecked && ip`；「无」= `ipChecked && !ip`
- [x] 无任何已检测数据时 toast 提示先检测
- [x] 抽 `tagHtml` / `userTags(u)`，保留互关/原始粉丝/特别/分组
- [x] 有 IP 输出 `IP:xx`，用 `.t-ip`
- [x] 模板改用 `<span class="bm-tags">`
- [x] `setRowTags(u)` 只局部刷新，不整表 `render()`

## 6. 代码：批量检测 `fetchInfo('ip')`

- [x] 选中优先，否则 `this.view`；空列表提示
- [x] 单独队列，并发 2（其它类型仍为 5）
- [x] 间隔 `Math.max(shortDelay, 800)` ms
- [x] 单请求超时 20 s
- [x] `-352/-799` 重试 2 次（1.5 s / 3 s）
- [x] `-101` 中止并提示重新授权
- [x] `-404` 记已检测·无 IP
- [x] 成功/失败计数与进度写入 `#bm-st`（完成信息在 `render()` 之后写，避免被 `updateUI` 覆盖）
- [x] 再点按钮/关面板可停止，在途请求不再新增
- [x] 每个确定结果 `updateDBItem(u)`
- [x] 网络错误只计失败，不写 `ipChecked`（单测覆盖）

## 7. 代码：持久化

- [x] `parse()` 补 `ip:''`、`ipChecked:false`、`ipAt:0`
- [x] `parse()` 的「已解析」快速返回分支也补齐缺省字段（导入旧 JSON 兼容）
- [x] `syncData()` 合并旧记录时保留 `ip/ipChecked/ipAt`
- [x] 导入导出自动带三字段
- [x] 确认 IndexedDB 仍为 `BiliFollowManageDB` v2、无 schema 变更
- [x] 旧 1.0.0 数据库可直接打开（store 为 `keyPath:uid` 的 schemaless 对象仓库）

## 8. 构建

- [x] 新增 `scripts/build-follow.mjs`
- [x] 从头部读取 `@version`
- [x] 注入 `@downloadURL` / `@updateURL`（沿用 1.0.0 地址）
- [x] 输出 `dist/BiliBili 关注管理-<version>.user.js`
- [x] 失败时抛错退出（非 0）
- [x] `package.json` 加 `build:follow`
- [x] `package.json` 加 `test:follow`（glob，非目录）
- [x] `devDependencies` 加 `jsdom`，更新 lockfile

## 9. 测试

- [x] `node --check BilibiliFollowManage.js`
- [x] `test/follow-manage/` 下 jsdom 启动与桩（`GM_addStyle`、`GM_xmlhttpRequest`、`indexedDB`、`alert/confirm/prompt`、`setTimeout`）
- [x] 用例：dropdown（5）
- [x] 用例：filter（5）
- [x] 用例：tags（6）
- [x] 用例：detect-ip（19）
- [x] 用例：detect-oldfan（16）
- [x] 用例：access-key（14）
- [x] 用例：sync（11）
- [x] `npm run test:follow` 全绿（76/76）
- [x] 审查修复（P0）：`act()` 用 `startsWith('fetch-')` 路由，补「点真实按钮」回归测试，断言不发起 `x/relation/*modify`
- [x] 审查修复（P1）：批次内固定 `scanKey` 且变更即停；`manageAccessKey` 加 `busy` 守卫；`unknown` 改确认门；缺 `card` 记失败
- [x] 审查修复（中）：同步替换列表后按 uid 重新解析；双击 `busy` 前置 + `_ipAuthing`；导入旧备份保留 IP；每 25 人 canary + 整批 0 属地告警
- [x] 审查修复（低）：TV 授权不手写 Cookie；`.bm-name` 省略号；调试钩子仅 `__BM_TEST__` 暴露；`state.view` 初始化
- [x] `npm run build:follow` 产物校验（版本、两行、`node --check` 通过）
- [x] `scripts/probe-app-api.mjs` 扩展到 6 项：真实探针 6/6（`TESTING.md` §4 已记录日期）

## 10. 推送

- [x] 提交前 `git status` / `git diff` 自查，无临时文件
- [x] 提交拆分：`feat(follow)`（代码/测试/构建） + `docs(bili-follow-manage)`
- [x] `git push origin feat/ip-oldfan-detect`
- [x] 确认 `main` 未改动、未 force push、未推上游
- [x] 记录远端分支链接（`https://github.com/dfgger433/TamperMonkeyScript/tree/feat/ip-oldfan-detect`）

## 11. 交付

- [x] 产物拷到 `H:\资源\js脚本\bilibili.com\BiliBili 关注管理-1.1.4.user.js`
- [x] 回写 `H:\资源\js脚本\bilibili.com\TamperMonkeyScript-main\BilibiliFollowManage.js`（源文件）
- [x] 比对回写文件与仓库源文件一致（md5）
- [ ] 交用户按 `MANUAL-TEST.md` 验收（IP 属地 + 老粉计划）
- [ ] 收集验收结果（通过/失败项、控制台日志、Network 记录）

## 阶段 2（已实现；1.1.0 首版 → 1.1.1 风控改造 → 1.1.2 粉丝预筛 → 1.1.4 粉丝数来源修正）

- [x] 用户回复「继续任务2」，触发阶段 2
- [x] 加 `<option value="oldfan">老粉计划</option>` 与「老粉计划」按钮（`#bm-btn-fetch-oldfan`）
- [x] `fetchInfo('oldfan')`：`encWbi` + `x/space/wbi/acc/info?mid=&platform=web&web_location=1550101`，`token` 空串
- [x] 读 `data.contract.is_follow_display` / `is_display`
- [x] 字段 `oldFan/oldFanDisplay/oldFanChecked/oldFanAt`
- [x] 标签 `.t-oldfan`，筛选三态同 `ip`；导入/同步保留
- [x] `getWbi` 改用 `reqRaw`：nav 返回 `-101` 时仍取到 wbi key
- [x] 风控改造（1.1.1）：实测补齐请求头仍 `-352` → 空间页 fetch/XHR 钩子采集 + localStorage 缓存 + 面板合并（`show()`/`focus`/实时行内）
- [x] 风控熔断：批量兜底改页面上下文 fetch、串行 ≥2.5s、`-352/-401/-403/-412/-799` 立即中止不重试；已采集/已检测的人不再请求
- [x] 粉丝预筛（1.1.2）：粉丝 ≥1000 直接判「不显示」且不发请求；已有结果不覆盖；归入「无老粉计划」
- [x] 粉丝数来源修正（1.1.3）：`syncData` 改为优先用 followings 的 `follower`，不再被旧缓存覆盖（预筛准确性的前提）
- [x] 已有老粉标志跳过（1.1.4）：`contract_info.is_contract === true`（原始粉丝）不请求、不改状态，只提示跳过
- [x] `@grant unsafeWindow`、`@run-at document-start`、`@match https://space.bilibili.com/*`；面板仅在关注/粉丝页创建
- [x] 版本 `1.1.4`，76 项单测与手动验收（MANUAL-TEST 第 12 节）
- [x] 明确区分：现有 `contract`「老粉」= 原始粉丝；阶段 2 `oldfan` = 老粉计划
