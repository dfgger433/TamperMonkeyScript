# 调研记录 · IP 属地与老粉计划

> 结论均为调研阶段实测/比对所得；阶段 1 代码已按此实现，执行结果见 `PLAN.md` §9。行号为 1.0.0 基线（`6f64cf1`）。
> 复核命令见文末；探针命令见 `TESTING.md`。

## 1. 三份源文件一致，发布版只多两行

| 对象 | 字节 | md5 | 说明 |
| --- | --- | --- | --- |
| 本地 `HEAD:BilibiliFollowManage.js` | 51457 | `4e239f41ae0baf0541f65b3ecc683e52` | 基线 |
| fork `dfgger433/TamperMonkeyScript` | 51457 | `4e239f41…` | 与本地一致 |
| 上游 `YisRime/TamperMonkeyScript` | 51457 | `4e239f41…` | 与 fork 一致 |
| `BiliBili 关注管理-1.0.0.user.js` | 51689 | `6c2452e5…` | 仅多两行 |

比对 `BiliBili 关注管理-1.0.0.user.js` 与基线，唯一差异是头部：

```js
// @downloadURL https://update.greasyfork.org/scripts/537856/BiliBili%20%E5%85%B3%E6%B3%A8%E7%AE%A1%E7%90%86.user.js
// @updateURL   https://update.greasyfork.org/scripts/537856/BiliBili%20%E5%85%B3%E6%B3%A8%E7%AE%A1%E7%90%86.meta.js
```

含义：构建只需注入这两行，不要改业务代码；源文件保持无发布地址。

## 2. 网页接口拿不到别人的 IP 属地

| 探测 | 观察 | 结论 |
| --- | --- | --- |
| `GET https://space.bilibili.com/2` 首屏 HTML | 搜索「属地」无结果 | 服务端不渲染属地 |
| 空间页 JS | 只在 `/x/web-interface/nav` 读取自己的 `data.ip_region` | 只用于「我的」属地，不覆盖他人 |
| `GET https://api.bilibili.com/x/web-interface/card?mid=2` | 返回 `card` 无 IP/属地字段 | 名片接口不提供 |
| 空间页调用 `GET /x/space/wbi/acc/info` | 请求参数 `token` 为空串 | 网页端不靠 token 取属地 |

结论：要靠网页登录态拿到每个关注用户的属地，没有可用字段；必须换 App 接口。

## 3. App `x/v2/space` 匿名可通，但没有 location 标签

请求：`GET https://app.bilibili.com/x/v2/space`

| 参数 | 值 |
| --- | --- |
| `appkey` | `1d8b6e7d45233436` |
| `appsec`（签名用） | `560c52ccd288fed045859ed18bffd973` |
| `build` | `6720300` |
| `mobi_app` / `platform` | `android` / `android` |
| `vmid` | 目标 UID |
| `ts` | 秒级时间戳 |
| `sign` | `md5(按 & 拆分排序后的参数串 + appsec)` |

实测：

- 匿名请求 `vmid=2` 返回 `code:0`，说明签名与接口可用。
- 抽查 30 个 UID，`space_tag` 中**没有** `type:"location"`；少数有 `school` 标签。
- 说明匿名态只能拿到公开标签，IP 属地需要有效 `access_key`。

## 4. 假 access_key 也返回 `code:0`

- `access_key=deadbeef...`（伪造）请求同样返回 `code:0`。
- 接口把无效 token 当匿名处理，或直接忽略该参数；`code` 只表示「请求被接受」。
- 因此**不能**用返回码判断授权；必须看语义：
  - 用本人 UID 请求，能取到 `space_tag` 里的 `location` 才算有效；
  - 或用登录态接口 `GET https://api.bilibili.com/x/v2/history`，无效/缺失 token 返回 `-101`。
- `-101` 也可能由未登录、token 过期触发，提示统一为「重新授权」。

## 5. TV 登录授权链路

| 步骤 | 请求 | 关键参数/返回 |
| --- | --- | --- |
| 1 | `POST https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code` | `appkey=783bbb7264451d82`，secret `2653583c8873dea268ab9386918b1d65`；返回 `code:0` + `auth_code` |
| 2 | `POST https://passport.bilibili.com/x/passport-tv-login/h5/qrcode/confirm` | 带 `auth_code`、`csrf`（`bili_jct`）、网页 Cookie |
| 3 | `POST https://passport.bilibili.com/x/passport-tv-login/qrcode/poll` | 轮询拿到 `access_token` |

注意：

- 这是 TV 端登录，README 明确「首次获取可能导致网页端掉线」。UI 必须先提示，让用户选择。
- 本脚本**不展示二维码**：用当前网页登录态拿到 `csrf` 后自动调用 `h5/qrcode/confirm` 确认，再 `poll` 取 token（与 BiliRevealForSpace 一致），因此「首次可能掉线」来自这一步。
- `access_token` 等同于账号凭据，只存本机 `localStorage`，不打印、不上传。
- `auth_code` 有时效，过期需从第 1 步重新开始（本脚本每次都新建）。

## 6. 老粉计划字段（阶段 2；1.1.3 改为主页采集）

请求（网页接口，复用现有 `encWbi`）：

```text
GET https://api.bilibili.com/x/space/wbi/acc/info?mid=<mid>&platform=web&web_location=1550101&<wbi 参数>
```

- `token` 传空串即可（与空间页一致）。
- 响应：`data.contract.is_follow_display`（是否显示老粉计划）、`data.contract.is_display`。
- 参考脚本 `哔哩哔哩老粉计划检测器-20260902.user.js` 第 3374 行即读 `contract?.is_follow_display`。
- 该接口匿名通常 `-352/-403`（风控），需要浏览器登录态；这也是它不能进 CI 的原因。
- **2026-11-03 复测（用户反馈「老粉计划会触发风控」后）**：用真实 wbi 签名 + 浏览器 UA + `Referer` + `Origin` + `buvid3/buvid4/b_nut` + `x-bili-trace-id` 请求，仍返回 `-352 风控校验失败` 且带 `v_voucher`。说明不是请求头缺失，而是该接口对脚本请求启用 gaia 校验；**批量直连不可行**。
- 参考脚本的可靠做法：**不自己发请求**，用 `@run-at document-start` + `unsafeWindow` 钩住空间页自己的 `acc/info`（fetch/XHR）响应；它的 `fallbackFromPerformance` 也只是用页面上下文 `fetch(url,{credentials:'include'})` 重放页面已发出的 URL。
- 因此 1.1.3 改为「主页采集」：空间页钩子把 `contract` 写进 `localStorage` 的 `BiliFollowManageOldFanCache`，关注页面板合并。批量请求只作兜底（页面上下文 fetch、串行 ≥2.5s、`-352` 立即熔断不重试）。
- **粉丝数规则（用户确认，2026-11-03）**：老粉计划只在目标用户**自己的粉丝数 < 1000** 时显示，≥1000 不显示。1.1.2 据此预筛：`fans >= 1000` 且还没有检测结果的人直接标「已检测·不显示」并**不发请求**；已有结果的人不覆盖。阈值在脚本里是常量 `OLD_FAN_MAX_FANS`。
- 1.1.3 修正粉丝数来源：`syncData()` 原实现用旧缓存覆盖同步到的 `follower`（`u.fans = old.fans || 0`），粉丝数会长期停在旧值，导致预筛误判。现改为优先用接口值，接口没给才回退旧值。
- 实现补充：`getWbi()` 不能因 nav 返回 `-101`（未登录）就丢弃 `wbi_img`——wbi key 与登录无关，否则未登录环境下老粉计划检测会全部失败。现改用 `reqRaw` 只解析 JSON、不看 `code`。

命名冲突：现有状态下拉 `contract`（基线 252 行）读的是 `contract_info.is_contract`（基线 445 行），标签写「原始粉丝」（基线 562 行），**不是**老粉计划。阶段 2 必须用新值 `oldfan`，不要复用 `contract`。

## 7. 油猴存储按脚本隔离

- Tampermonkey 的 `GM_setValue/GM_getValue` 按脚本隔离；本脚本无法读取 BiliRevealForSpace 的存储。
- BiliRevealForSpace 的字段名就是 `aceess_key`（原脚本拼写错误，非本文笔误）。
- 落地方式：引导用户打开 油猴管理面板 → 已安装脚本 → 「哔哩哔哩主页 IP 属地」→ 存储 → 复制 `aceess_key` → 粘贴到本脚本。
- 读不到再走自动 TV 授权；两条路都失败则提示手动输入。

## 8. 实测探针（无需登录）

| 探针 | 预期 | 用途 |
| --- | --- | --- |
| 匿名签名 `x/v2/space?vmid=2` | `code:0` | 验证 appkey/签名/网络 |
| `passport…/qrcode/auth_code` | `code:0` + `auth_code` | 验证 TV 链路入口 |
| 匿名 `x/space/wbi/acc/info?mid=2` | 通常 `-352/-403`（或 HTTP 412） | 证明它依赖浏览器登录态 |

具体 PowerShell 见 `TESTING.md` §4。探针不写任何 Cookie/token 到仓库。

## 为什么不能只靠网页接口

1. 空间页 HTML 是首屏直出，但没有属地字段；抓 HTML 拿不到。
2. `x/web-interface/card` 是网页端最常用的名片接口，同样没有 IP 字段。
3. 页面 JS 只在自己的 `nav.ip_region` 读属地，这是「当前登录用户」的，不是被访问用户的。
4. 空间页调用 `acc/info` 时 `token` 传空串，响应里只有认证、会员、`contract` 等，没有属地。
5. 所以「网页已登录」不等于「能看他人属地」；必须用 App 端 `x/v2/space` + `access_key`。
6. 老粉计划是例外：它就在网页 `acc/info` 的 `contract` 里，属于阶段 2。

## 为什么假 key 会骗过返回码

- App 接口的 `sign` 校验的是「请求由合法 appkey 发出」，不是「用户已登录」。
- 匿名请求本来就允许（`code:0`），无效 `access_key` 会被忽略或降级为匿名，于是仍返回 `code:0`。
- 但匿名响应里的 `space_tag` 不含 `location`，语义上是「没拿到」，不是「没有属地」。
- 因此授权校验只能看**响应内容**：本人 UID 能否取到 `location`；或换 token 专用接口看 `-101`。
- 实现约束：`validateAccessKey` 禁止只判断 `code === 0`；`fetchIpLocation` 也不要把「无 location」直接当成「该用户无属地」，要先确认授权有效。

## 证据边界与待确认

- 30 个 UID 是抽样，不是全量；不能证明所有匿名响应都无 location。
- 有效 `access_key` 下 `x/v2/space` 返回 `location` 的完整形态，待阶段 1 联调确认。
- App 接口未公开，参数、风控、字段可能随时变化；常量集中存放便于修。
- 计划稿曾把状态下拉记为第 254 行，实际 1.0.0 为第 252 行；以代码为准。
- 本文不含任何本轮测试结果；测试状态见 `TESTING.md` 与 `MANUAL-TEST.md`。

## 复核命令（校验第 1 条）

```powershell
cd 'H:\资源\js脚本\bilibili.com\bili-follow-manage'
git cat-file -s HEAD:BilibiliFollowManage.js   # 51457
$t = "$env:TEMP\bfm_base.bin"
cmd /c "git cat-file blob HEAD:BilibiliFollowManage.js > `"$t`""
(Get-FileHash $t -Algorithm MD5).Hash.ToLower()  # 4e239f41ae0baf0541f65b3ecc683e52
$u = 'H:\资源\js脚本\bilibili.com\BiliBili 关注管理-1.0.0.user.js'
Compare-Object (Get-Content $t) (Get-Content $u) | Format-Table -Wrap
```
