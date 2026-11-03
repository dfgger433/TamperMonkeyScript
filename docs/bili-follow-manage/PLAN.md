# BiliBili 关注管理 · IP 属地 / 老粉计划检测 实施计划

> 基线：`BilibiliFollowManage.js` 1.0.0（`6f64cf1`，51457 字节，md5 `4e239f41ae0baf0541f65b3ecc683e52`）。
> 分支：`feat/ip-oldfan-detect`，远端 fork `dfgger433/TamperMonkeyScript`；行号指 1.0.0 基线，实现后以函数名/选择器为准。本文只定方案，不代表已实现、已测试。

## 1. 目标与范围

| 项目 | 阶段 1（任务 1，已完成） | 阶段 2（任务 2，已完成） |
| --- | --- | --- |
| 能力 | 判断关注用户主页**有没有 IP 属地**，有则显示属地文本 | 判断关注用户是否显示老粉计划 |
| 数据源 | App 接口 `https://app.bilibili.com/x/v2/space` + `access_key` | 网页接口 `x/space/wbi/acc/info` 的 `data.contract`（`is_follow_display` / `is_display`） |
| 复用 | 只复用 BiliRevealForSpace 的取数思路 | 复用现有 `encWbi`，`token` 传空串（与网页端一致） |
| 不做 | 页面注入、悬浮菜单、独立面板、自动改主页 | 任何 UI 注入 |
| 版本 | `1.0.3`（1.0.0 → 1.0.1 → 1.0.2 → 1.0.3） | `1.1.3`（本次） |

阶段 1 只改本脚本：状态下拉、动作按钮、授权状态、行内标签、筛选、批量检测、持久化。不新增 `@grant`，不引入第三方运行时。
阶段 2 在同一套骨架上加 `oldfan` 选项/按钮/字段/筛选/标签，复用 `fetchInfo` 队列与 `reqRetry` 退避。

## 2. 验收标准（8 条）

| # | 标准 | 验证方式 |
| --- | --- | --- |
| A1 | 头部版本 `1.1.3`，`@description` 含 IP 属地，新增 `@connect app.bilibili.com`、`@connect passport.bilibili.com`，`@grant` 仍为 `GM_xmlhttpRequest` / `GM_addStyle` | 读头部 + `node --check` |
| A2 | 状态下拉出现「IP属地」；动作栏出现「IP属地」按钮；子栏出现可点击的「IP授权: …」标签 | 手动打开面板 / jsdom 断言 |
| A3 | 支持粘贴已有 `aceess_key`、校验、清除；未授权时引导获取；授权态写入 `localStorage` 的 `BiliFollowManageSettings`（`accessKey/accessKeySrc/accessKeyAt`） | 单测 + 手动 |
| A4 | 批量检测按「选中优先，否则当前视图」执行；有属地显示 `IP:xx`，无属地记为已检测·无 IP；未检测不参与有/无筛选 | 单测 + 手动 |
| A5 | 筛选「有IP属地 / 无IP属地」三态正确：未检测两边都不匹配；无已检测数据时提示先检测 | 单测 + 手动 |
| A6 | 刷新、重新「同步」、导入导出后 `ip/ipChecked/ipAt` 不丢；IndexedDB 无 schema 变更 | 单测 + 刷新验证 |
| A7 | `scripts/build-follow.mjs` 产出 `dist/BiliBili 关注管理-1.1.3.user.js`（仅多 `@downloadURL/@updateURL` 两行）；`npm run test:follow`（即 `node --test "test/follow-manage/*.test.mjs"`）全绿 | 构建 + 测试 |
| A8 | 分支推到 fork，`main` 未动；产物拷到 `H:\资源\js脚本\bilibili.com\BiliBili 关注管理-1.1.3.user.js` 并回写 `TamperMonkeyScript-main\BilibiliFollowManage.js`；用户按 `MANUAL-TEST.md` 验收通过 | `git log` + 文件比对 + 用户签字 |

## 3. 调研结论（摘要）

| # | 结论 | 详见 |
| --- | --- | --- |
| 1 | 仓库、fork、上游三份源文件一致：51457 字节 / md5 `4e239f41…`；发布版只多两行 `@downloadURL/@updateURL` | `RESEARCH.md` §1 |
| 2 | 网页接口拿不到他人 IP 属地：空间页 HTML、`x/web-interface/card` 均无字段；页面只在自己的 `nav.ip_region` 读属地；`acc/info` 的 `token` 传空串 | §2 |
| 3 | App 接口 `x/v2/space` 用公开 appkey/appsec 匿名签名可返回 `code:0`，但 30 个 UID 的 `space_tag` 均无 `type:"location"` | §3 |
| 4 | 假 `access_key` 同样 `code:0`，不能靠返回码判授权；须验证「本人主页能取到 location」或用 `x/v2/history` 的 `-101` | §4 |
| 5 | TV 授权链路可用：`auth_code` → `h5/qrcode/confirm` → `qrcode/poll` 取 `access_token`；首次可能导致网页端掉线 | §5 |
| 6 | 老粉计划字段：`acc/info` 的 `data.contract.is_follow_display` / `is_display`，网页 `token` 传空串，复用 `encWbi` | §6 |
| 7 | 油猴存储按脚本隔离，读不到 BiliRevealForSpace 的 `aceess_key`（原脚本拼写如此），只能引导复制粘贴 | §7 |
| 8 | 三条无需登录的探针可做回归：匿名 App `x/v2/space`、passport `auth_code`、匿名 `acc/info`（-352/-403） | §8 |

## 4. 目录与 Git 方案

| 路径 | 动作 |
| --- | --- |
| `docs/bili-follow-manage/PLAN.md` 等 5 份 | 新增（本轮） |
| `BilibiliFollowManage.js` | 修改：头部、常量、App 方法、UI、筛选、标签、检测 |
| `scripts/build-follow.mjs` | 新增：单文件构建 + 补两行发布地址 |
| `test/follow-manage/*.test.mjs` | 新增：jsdom 单测 |
| `package.json` / `package-lock.json` | 新增 `build:follow`、`test:follow`、`jsdom` |
| `dist/BiliBili 关注管理-<version>.user.js` | 构建产物，随分支入库（fork 自包含），同时另拷到外部安装路径 |
| `scripts/probe-app-api.mjs` | 新增：无需登录的真实接口探针（签名 / auth_code 入口） |

Git 约定：

- 只在 `feat/ip-oldfan-detect` 提交；不切 `main`，不推上游，不 force push。
- 分 2 个提交：`feat(follow): …`（代码 + 测试 + 构建 + 包配置）、`docs(bili-follow-manage): …`（5 份文档 + 执行记录）。提交前跑 `git status`，确认没有把临时探针输出、`node_modules` 误加（`dist/` 按计划入库）。
- 推送：`git push origin feat/ip-oldfan-detect`。合入 fork 的 `main` 由用户决定，本轮不做。

## 5. 阶段 1 实施

### 5.1 头部（1.0.0 第 1–13 行）

| 字段 | 改动 |
| --- | --- |
| `@version` | `1.0.0` → `1.1.3` |
| `@description` | 追加「主页 IP 属地检测」 |
| `@connect` | 新增 `app.bilibili.com`、`passport.bilibili.com`；保留 `api.bilibili.com` |
| `@grant` | 不变（仍只有 `GM_xmlhttpRequest`、`GM_addStyle`） |
| `@downloadURL/@updateURL` | **不写进源文件**，只由构建脚本注入 |

### 5.2 常量与签名（加在 `encWbi` 之后，基线第 25 行后）

| 名称 | 值/行为 |
| --- | --- |
| `APP_KEY` / `APP_SEC` | `1d8b6e7d45233436` / `560c52ccd288fed045859ed18bffd973` |
| `LOGIN_APP_KEY` / `LOGIN_APP_SEC` | `783bbb7264451d82` / `2653583c8873dea268ab9386918b1d65` |
| `APP_BUILD` | `6720300` |
| `APP_UA` | BiliDroid 6.72.0 / android / build 6720300 |
| `genBuvid()` | 生成 `XX` + 32 位十六进制形态的 buvid（随机，够请求用） |
| `signParam(params, sec)` | 拼 `ts` → 按 `&` 拆开排序 → `md5(sorted + sec)` → 返回 `...&sign=...` |

签名只处理 App 接口；网页接口继续用 `encWbi`。所有请求参数需 `encodeURIComponent`，`ts` 为秒级。

### 5.3 App 新方法（建议加在 `getWbi` 附近）

| 方法 | 职责 |
| --- | --- |
| `parseAccessKey(raw)` | 去空白、去 `access_key=` 前缀/引号，提取十六进制串；不合法返回空 |
| `validateAccessKey(key)` | 用本人 UID 请求 `x/v2/space`，能取到 `location` 才算有效；辅以 `x/v2/history` 的 `-101` |
| `acquireAccessKey()` | TV 二维码链路：`auth_code` → 展示/确认 → `poll`；成功后写 settings |
| `manageAccessKey()` | 交互入口：查看状态、粘贴替换、清除 |
| `ensureAccessKey()` | 有则返回；无则引导（复制 BiliRevealForSpace 的 key 或走 TV 授权） |
| `setAccessKey(key, src)` | 写 `settings.accessKey/accessKeySrc/accessKeyAt` 并 `saveSettings()` |
| `updateAuthLabel()` | 刷新 `#bm-ip-auth` 文案与颜色 |
| `appReq(url, opts)` | `GM_xmlhttpRequest` 封装：UA、`timeout:20000`、JSON 解析、错误归一 |
| `fetchIpLocation(uid)` | 签名请求 `x/v2/space`，从 `space_tag` 找 `type==='location'` |
| `userTags(u)` | 组装行内标签数组（互关/特别/分组/原始粉丝/IP） |
| `setRowTags(u)` | 只重绘该行 `.bm-tags`，不整表 render |

`-101` 视为授权失效：停止批量、清空/标记授权、提示重新授权。`-404` 视为用户不存在/无主页：记「已检测·无 IP」。网络错误不改 `ipChecked`。

### 5.4 UI（基线 224–310、312–383）

| 位置 | 改动 |
| --- | --- |
| 状态下拉（基线 252 行） | 末尾加 `<option value="ip">IP属地</option>` |
| 动作栏「动态」后（基线 264 行后） | `<button class="bm-btn" id="bm-btn-fetch-ip" title="检测主页是否有 IP 属地（需要 access_key）">IP属地</button>` |
| 子栏「清空缓存」后（基线 280 行后） | `<span class="bm-lbl" id="bm-ip-auth" title="点击管理 IP 授权">IP授权: 未授权</span>`，可点击管理/清除 |
| CSS（标签区，基线 96 行附近） | 加 `.t-ip{...}`；新增 `.bm-tags{display:inline-flex;...}` |

绑定：`Q('#bm-btn-fetch-ip').onclick = () => this.act('fetch-ip')`；`#bm-ip-auth` 点击走 `manageAccessKey()`；下拉仍复用 `addCondOnChange('stat')`，不要为 `ip` 另写一套。

### 5.5 筛选三态

`addCond('stat')` 对 `v==='ip'` 特判 chip 文案：`op` 为「是」→「有IP属地」，为「非」→「无IP属地」；不要生成「状态 是 IP属地」。

`render()` 的 `stat` 分支：

| 条件 | `is_match` |
| --- | --- |
| `!u.ipChecked` | 不匹配「有」也不匹配「无」 |
| `u.ipChecked && u.ip` | 匹配「有」 |
| `u.ipChecked && !u.ip` | 匹配「无」 |

若整表没有任何 `ipChecked` 用户，用户添加该条件时 toast 提示「请先点击 IP属地 检测」。toast 用现有 `.bm-toast` 机制，不新增依赖。

### 5.6 行内标签

- 抽 `userTags(u)`：现有互关、原始粉丝、特别关注、分组逻辑原样搬入，末尾按需追加 IP。
- 有属地：`IP:<属地文本>`（如 `IP:上海`），用 `.t-ip`；无属地默认不加 IP 标签，避免误导。
- 模板改为 `<span class="bm-tags">${userTags(u).join('')}</span>`，保持 `title` 与链接不变；检测单条完成时调 `setRowTags(u)` 局部刷新，不要每完成一个人就 `render()`。

### 5.7 批量检测（`fetchInfo('ip')`）

| 项 | 方案 |
| --- | --- |
| 入口 | `act('fetch-ip')` → `fetchInfo('ip')`；按钮文字在检测中变「停止」 |
| 范围 | 有选中用选中；无选中用 `this.view`；空列表提示 |
| 并发 | 2（IP 检测单独队列，不复用动态的 5） |
| 间隔 | `Math.max(this.settings.shortDelay, 800)` ms |
| 超时 | 单请求 20 s |
| 重试 | `-352/-799` 重试 2 次，间隔 1.5 s、3 s |
| 中止 | `-101` 立即中止并提示重新授权 |
| 无主页 | `-404` 记 `ipChecked=true, ip=''` |
| 进度 | `#bm-st` 显示 `检测中... n / total`，结束显示成功/失败数 |
| 停止 | 再次点按钮或关面板置 `state.stop`，在途请求不再发起 |
| 写库 | 每个确定结果 `updateDBItem(u)`；网络错误只计失败，不写「无 IP」 |

### 5.8 持久化

- `parse()` 返回对象补默认值：`ip: ''`、`ipChecked: false`、`ipAt: 0`；已解析对象直接返回的分支也要补齐（用 `??`），避免旧库记录缺字段。
- `syncData()` 合并旧记录时，除 `fans/videoTime/dynamicTime` 外保留 `ip/ipChecked/ipAt`；导入走 `parse()` 后 `Object.assign`，导出直接序列化整条记录，字段自动带上。
- IndexedDB 仍是 `BiliFollowManageDB` v2、`follows` 仓库，**不升版本、不加索引**。

### 5.9 构建与测试

- `scripts/build-follow.mjs`：读 `BilibiliFollowManage.js`，从头部取 `@version`，在 `==/UserScript==` 前注入 `@downloadURL`、`@updateURL`（值与 1.0.0 发布版一致），输出 `dist/BiliBili 关注管理-<version>.user.js`；失败退出码非 0。
- `package.json`：加 `"build:follow": "node scripts/build-follow.mjs"`、`"test:follow": "node --test \"test/follow-manage/*.test.mjs\""`（目录参数在 Node 24 上会被当成模块加载，必须用 glob），`devDependencies` 加 `jsdom`。
- 测试：`node --check`；`npm run test:follow`。jsdom 启动脚本，桩掉 `GM_addStyle`、`GM_xmlhttpRequest`、`indexedDB`、`alert/confirm/prompt`，`setTimeout` 立即执行；覆盖 dropdown、filter、tags、detect-ip、access-key、sync。

### 5.10 交付

构建并校验产物头部（版本、两行发布地址、字节数）→ 推送 `feat/ip-oldfan-detect` 到 `origin` → 拷贝到 `H:\资源\js脚本\bilibili.com\BiliBili 关注管理-1.1.3.user.js` → 回写 `H:\资源\js脚本\bilibili.com\TamperMonkeyScript-main\BilibiliFollowManage.js`（源文件）→ 交用户按 `MANUAL-TEST.md` 验收；**未通过不进入阶段 2**。

## 6. 测试计划

| 层 | 命令/方式 | 通过标准 |
| --- | --- | --- |
| 语法 | `node --check BilibiliFollowManage.js` | 退出码 0 |
| 单测 | `npm run test:follow` | 全部 `ok`，无未处理 rejection |
| 构建 | `npm run build:follow` | 产物存在、版本正确、仅多两行 |
| 探针 | `TESTING.md` §4 三条 | 返回码符合预期（不依赖登录） |
| 手动 | `MANUAL-TEST.md` 全流程 | 每步「预期结果」成立 |
| 回归 | 旧功能：同步/取关/分组/导入导出 | 与 1.0.0 行为一致 |

## 7. 阶段 2（任务 2：1.1.0 首版 → 1.1.3 风控改造）

触发：用户回复「继续任务2」（任务 1 的手动验收仍在并行进行，若发现问题回流修）。

首版（1.1.0）：

- 下拉加 `<option value="oldfan">老粉计划</option>`，动作栏加「老粉计划」按钮（`#bm-btn-fetch-oldfan`）。
- `fetchInfo('oldfan')`：`encWbi({ mid, token:'', platform:'web', web_location:1550101 })` → `GET /x/space/wbi/acc/info`，读 `data.contract.is_follow_display`（是否显示老粉计划）与 `is_display`。
- 字段：`oldFan/oldFanDisplay/oldFanChecked/oldFanAt`；标签 `.t-oldfan`；筛选三态同 `ip`（未检测两边都不匹配）；导入/同步保留。
- 单测 `detect-oldfan.test.mjs` + 下拉/筛选/标签/同步/导入用例。
- `getWbi()` 改为 `reqRaw`：nav 未登录返回 `-101` 时仍能取到 `wbi_img`（wbi key 与登录无关）。

### 7.1 风控改造（1.1.1，用户反馈「老粉计划会触发风控」）

实测：真实 wbi 签名 + 浏览器 UA/Referer/Origin/buvid3/buvid4/b_nut/x-bili-trace-id 仍 `-352` 且带 `v_voucher`——该接口对脚本请求启用 gaia 校验，**批量直连不可行**。

- 采集：新增 `@match https://space.bilibili.com/*`、`@grant unsafeWindow`、`@run-at document-start`；用 fetch/XHR 钩子捕获空间页自己的 `acc/info` 响应，写 `localStorage` 的 `BiliFollowManageOldFanCache`；面板 `show()`/`focus` 时合并进行内标签与 IndexedDB。
- 兜底：`fetchInfo('oldfan')` 先合并缓存、只请求未采集的人；改为页面上下文 `fetch(..., {credentials:'include'})`（`webJson`，失败回退 GM）；串行 1 并发、间隔 `max(shortDelay,2500)`ms + 抖动；`-352/-401/-403/-412/-799` **立即熔断整批不重试**，弹窗引导改用主页采集。
- 面板仅在关注/粉丝页创建；空间页只装采集钩子（`@run-at document-start` 下把建面板延后到 `DOMContentLoaded`）。

### 7.2 粉丝数预筛（1.1.2 起；用户确认「被检测用户自己的粉丝数」）

- 规则：目标用户粉丝 < 1000 才可能显示老粉计划；≥1000 一律不显示。
- 实现：`OLD_FAN_MAX_FANS = 1000`；`fetchInfo('oldfan')` 在合并缓存后，把 `fans >= 1000` 且尚未检测的人直接标记 `oldFanChecked=true, oldFan=false`（归入「无老粉计划」筛选），**不发请求**；已有检测结果的人不覆盖。
- 效果：大 V 不再消耗请求，也不再触发风控/失败计数。
- 1.1.3 修正粉丝数来源：`syncData()` 原来用旧缓存覆盖 `fans`（`u.fans = old.fans || 0`），导致粉丝数长期不更新、预筛可能误判。改为**优先用 followings 接口返回的 `follower`**，只有接口没给时才回退旧值。

## 8. 风险与假设

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| TV 授权可能导致网页端掉线（README 明示） | 用户被登出 | 默认引导复制 `aceess_key`；TV 授权前弹确认 |
| App 接口未公开、签名/风控会变 | 检测失效 | 常量集中；`-352/-799` 退避；失败计数可见 |
| 假 key 也 `code:0` | 误判已授权 | 只用「本人主页有 location」判定 |
| 用户隐藏属地/无主页 | 结果为空 | 区分「已检测无 IP」与「未检测」；不把网络错误写成无 IP |
| 频率限制 | 批量中断 | 并发 2、间隔 ≥800 ms、可停止 |
| 现有 `contract` 选项也叫「老粉」 | 与阶段 2 混淆 | 文档/标签明确：现有 `contract` 是原始粉丝；阶段 2 用 `oldfan` |
| `accessKey` 明文存 localStorage | 同源脚本可读 | 仅存本机；提供清除；不写日志、不上传 |

假设：带有效 `access_key` 时 `x/v2/space` 的 `space_tag` 会返回 `type:"location"`（阶段 1 联调确认）；属地文本为省市级别，可能为空（空值按「无 IP」处理）；用户使用支持 `GM_xmlhttpRequest` 的 Tampermonkey 且 `@connect` 生效；发布渠道沿用 1.0.0 的 GreasyFork 地址。

## 9. 执行结果（2026-11-02/03，阶段 1 + 阶段 2）

| 项 | 结果 |
| --- | --- |
| 语法 `node --check` | 通过（源文件与 `dist` 产物均通过） |
| 单测 `npm run test:follow` | **73 项全绿**（dropdown 5 / filter 5 / tags 6 / detect-ip 19 / detect-oldfan 13 / access-key 14 / sync 11）；含点真实按钮回归、unknown 授权门、批次内 key 变更、缺 `card`/`contract` 失败、同步竞态、双击、旧备份导入、canary、主页采集钩子与缓存合并 |
| 审查回归（P0） | 修复 `act()` 只路由 `fetch-fans/fetch-dyn` 导致「IP属地」按钮落进关注/取关分支：改为 `t.startsWith('fetch-')`；补点击级测试断言不发起 `x/relation/*modify` |
| 审查回归（P1） | 批次内固定 `scanKey` 且中途变更即停；`manageAccessKey` 加 `busy` 守卫；`unknown` 授权不再静默放行（改为确认门）；`data.card` 缺失按失败处理 |
| 审查回归（中） | 授权期间 sync 替换 `state.list` 导致整批空跑 → 按 uid 重新解析 + 任务内取当前对象；双击并发两轮 → `busy` 前置 + `_ipAuthing` 占位；导入旧备份抹掉结果 → `mergeImported` 按字段存在性合并；服务端静默降级 key → 每 25 人 `x/v2/history` canary + 整批 0 属地告警 |
| 审查回归（低） | TV 授权不再手写 `Cookie` 头（交给 cookie jar，含 HttpOnly）；`.bm-name` 省略号防挤压；`__BM_APP/__BM_DEBUG` 仅在 `window.__BM_TEST__` 下暴露；`state.view` 初始化，空库点检测不再抛错 |
| 阶段 2 首版（1.1.0） | 状态下拉/按钮/字段/标签/三态筛选/持久化；`fetchOldFan` 用 `encWbi` + `token:''`；`getWbi` 改用 `reqRaw`（`-101` 也能取 wbi key） |
| 阶段 2 风控改造（1.1.1） | 实测补齐 UA/Referer/Origin/buvid 仍 `-352`（gaia）→ 改为空间页钩子采集（`@match space/*`、`unsafeWindow`、`document-start`、fetch/XHR 钩子 + localStorage 缓存 + 面板合并）；批量兜底改页面上下文 fetch、串行 ≥2.5s、`-352` 熔断不重试；空间页不建面板 |
| 粉丝数预筛（1.1.3） | 粉丝 ≥1000 的用户直接判「不显示」、不发请求（`OLD_FAN_MAX_FANS=1000`）；已有结果不覆盖；被跳过的归入「无老粉计划」 |
| 构建 `npm run build:follow` | 产出 `dist/BiliBili 关注管理-1.1.3.user.js`（85754 字节），仅多 `@downloadURL/@updateURL` 两行 |
| 版本 | 1.0.0 → 1.0.1（P0）→ 1.0.2（P1）→ 1.0.3（中/低）→ 1.1.0（任务 2）→ 1.1.1（风控改造）→ **1.1.3（粉丝预筛）** |
| 真实探针 `node scripts/probe-app-api.mjs` | **6/6 通过**：匿名 `x/v2/space` `code:0`；`fetchIpLocation` 无 location；假 key 无 location；passport `auth_code` `code:0`；`getWbi` 拿到 key；匿名 `acc/info` 被风控（`-352`，证明该接口对脚本请求启用 gaia） |
| 手动验收 | 待用户按 `MANUAL-TEST.md` 执行（IP 属地 + 老粉计划主页采集） |

注：真实「带 access_key 能取到 location」「登录态空间页能取到 contract」这两步无法在无登录环境验证，属联调项（`MANUAL-TEST.md` 第 4 步与第 12 步）。
