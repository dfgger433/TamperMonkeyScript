# 测试指南 · IP 属地 / 老粉计划检测

> 阶段 1 + 阶段 2 已在本机执行：语法 / 单测（73 项）/ 构建 / 真实探针（6 项）均通过；手动验收待用户在浏览器执行，见 `MANUAL-TEST.md`。
> 真实站点数据必须由已登录用户验证——仓库与 CI 没有 B 站 Cookie，也没有 `access_key`。

## 1. 状态（2026-11-02/03）

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 语法 | `node --check BilibiliFollowManage.js` | ✅ 通过（`dist` 产物同样通过） |
| 单测 | `npm run test:follow` | ✅ 73/73 通过（约 1.5 s） |
| 构建 | `npm run build:follow` | ✅ 产出 85754 字节（1.1.3），仅多两行发布地址 |
| 探针 A–F | §4 | ✅ 6/6 通过（`node scripts/probe-app-api.mjs`） |
| 手动验收 | `MANUAL-TEST.md` | ⏳ 待用户执行 |

## 2. 环境

- Node.js 18+（`node --test` 需要）；PowerShell 7（`pwsh`）。
- 在仓库根目录执行：`H:\资源\js脚本\bilibili.com\bili-follow-manage`。
- 首次单测前 `npm install`（会新增 `jsdom`，更新 `package-lock.json`）。
- 探针只读公开接口，不需要登录；**不要把 Cookie/token 写进命令或仓库**。

## 3. 离线测试

```powershell
cd 'H:\资源\js脚本\bilibili.com\bili-follow-manage'
node --version
node --check BilibiliFollowManage.js
npm run test:follow
```

构建与产物校验：

```powershell
npm run build:follow
$v = (Select-String -Path 'BilibiliFollowManage.js' -Pattern '@version\s+(\S+)').Matches.Groups[1].Value
$out = "dist/BiliBili 关注管理-$v.user.js"
Get-Item $out | Select-Object Length
Get-Content $out -TotalCount 16
Compare-Object (Get-Content 'BilibiliFollowManage.js') (Get-Content $out)
```

预期：产物存在；头部 `@version` 为 `1.1.3`；`Compare-Object` 只有 `@downloadURL`、`@updateURL` 两条 `=>`。

单测覆盖（`test/follow-manage/`，73 项）：

| 文件 | 用例 | 关键断言 |
| --- | --- | --- |
| `dropdown.test.mjs`（5） | 下拉含 `ip`/`oldfan`、两种 chip 文案、旧选项不变、两个按钮/授权入口 | `option[value=oldfan]` 文案「老粉计划」；chip「有/无老粉计划」 |
| `filter.test.mjs`（5） | 两种检测各有/无/未检测三态、与其它条件叠加、搜索叠加 | 未检测两边都不匹配 |
| `tags.test.mjs`（6） | `IP:xx`、`老粉计划`、两者并存、`setRowTags` 局部刷新、互关/原始粉丝/分组保留 | 标签 class 正确、无值不出标签 |
| `detect-ip.test.mjs`（19） | 批量写入/落库、`-352`/`-799` 重试、`-101` 中止、`-404` 记无 IP、网络错误不写、缺 `card` 记失败、选中优先、拒绝授权、unknown 授权门、批次内 key 变更、**点真实按钮**回归、`act` 路由、`parse` 补字段、**授权期间同步替换列表**、**双击不并发两轮**、**整批 0 属地告警**、**canary -101 中止**、空库不抛错 | 点按钮绝不能走关注/取关；每条请求必须带原 key |
| `detect-oldfan.test.mjs`（13） | `is_follow_display` 写入/落库/标签、缺 `contract` 记失败、**`-352` 熔断不重试**、`-404` 记无、**点真实按钮**、**已采集/已检测的人不再请求**、**粉丝 ≥1000 直接判无且不发请求**、**≥1000 已有结果不覆盖**、**主页采集缓存自动合并且不发请求**、**`applyOldFanCache` 落库**、**空间页 fetch 钩子写缓存（不消费原响应）**、**面板打开时实时更新标签**、wbi 签名与空 token | 风控后不写出假数据；缓存命中零请求；≥1000 粉丝不发请求；钩子捕获 `contract` 写入 `BiliFollowManageOldFanCache` |
| `access-key.test.mjs`（14） | 解析裸串/JSON/片段、校验（location/`-101`/正常/unknown）、手动粘贴成功/失败/unknown 确认与拒绝、TV 授权成功/失败/unknown 拒绝、清除、已授权不弹窗 | 假 key 不会被判为有效；unknown 不静默放行；confirm 带 csrf 且不手写 Cookie 头 |
| `sync.test.mjs`（11） | 同步保留 `ip`/`oldFan` 字段、不串旧数据、`attribute=6`/`face`、导入旧备份保留两种结果、新备份覆盖、新用户追加 | 旧备份缺字段时必须保留本机结果 |

桩要求：jsdom 启动脚本；`GM_addStyle` 空实现；`GM_xmlhttpRequest` 可控返回；`indexedDB` 用内存实现；`alert/confirm/prompt` 记录调用；`setTimeout` 立即执行（避免真实等待 800 ms）。

已知局限：`setTimeout` 被同步化，因此 800 ms 间隔、真实并发时序、停止的精确时点无法测；浏览器 HttpOnly cookie 与 TM 的 cookie jar 行为也无法在 jsdom 模拟。这些靠 `MANUAL-TEST.md` 真机覆盖（尤其 8.1 停止、11.2 TV 授权）。

## 4. 接口探针（可直接运行）

### A. 匿名 App 签名 `x/v2/space`

```powershell
function Get-Md5([string]$s) {
    $h = [System.Security.Cryptography.MD5]::Create()
    try { (($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($s)) | ForEach-Object { $_.ToString('x2') }) -join '') }
    finally { $h.Dispose() }
}
$appkey = '1d8b6e7d45233436'; $appsec = '560c52ccd288fed045859ed18bffd973'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$p = "appkey=$appkey&build=6720300&mobi_app=android&platform=android&ts=$ts&vmid=2"
$s = (($p -split '&') | Sort-Object) -join '&'
$sign = Get-Md5 ($s + $appsec)
$r = Invoke-RestMethod -Uri "https://app.bilibili.com/x/v2/space?$s&sign=$sign" `
    -Headers @{ 'User-Agent' = 'Mozilla/5.0 BiliDroid/6.72.0' }
"code=$($r.code)"
$r.data.space_tag | ConvertTo-Json -Depth 5
```

预期：`code=0`；`space_tag` 中通常**没有** `type` 为 `location` 的项（匿名态）。若返回非 0，先校时、UA、签名排序。

### B. TV 授权入口 `auth_code`

```powershell
$loginKey = '783bbb7264451d82'; $loginSec = '2653583c8873dea268ab9386918b1d65'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$p = "appkey=$loginKey&local_id=0&mobi_app=android&platform=android&ts=$ts"
$s = (($p -split '&') | Sort-Object) -join '&'
$sign = Get-Md5 ($s + $loginSec)
$r = Invoke-RestMethod -Method Post `
    -Uri 'https://passport.bilibili.com/x/passport-tv-login/qrcode/auth_code' `
    -Body "$s&sign=$sign" -ContentType 'application/x-www-form-urlencoded' `
    -Headers @{ 'User-Agent' = 'Mozilla/5.0 BiliDroid/6.72.0' }
"code=$($r.code) auth_code=$($r.data.auth_code)"
```

预期：`code=0` 且有 `auth_code`。只验证入口；不要继续 confirm/poll，除非你在做真实授权。

### C. 匿名 `acc/info` 依赖登录态

```powershell
$u = 'https://api.bilibili.com/x/space/wbi/acc/info?mid=2&platform=web&web_location=1550101'
try {
    $r = Invoke-WebRequest -Uri $u -SkipHttpErrorCheck `
        -Headers @{ 'User-Agent' = 'Mozilla/5.0'; 'Referer' = 'https://space.bilibili.com/2' }
    "HTTP=$($r.StatusCode)"
    $r.Content
} catch { "ERR=$($_.Exception.Message)" }
```

预期：`-352/-403`，或 HTTP 412 风控页。若返回 `code:0`，说明网络环境带了登录态，不能作为匿名证据。

### D. 仓库内置探针（推荐，走脚本自己的代码）

```powershell
cd 'H:\资源\js脚本\bilibili.com\bili-follow-manage'
node scripts/probe-app-api.mjs
```

它用 jsdom 启动真实脚本、把 `GM_xmlhttpRequest` 接到 Node `fetch`，因此验证的是**脚本自己的签名实现**，而不是另一份重写：
1. 匿名 `x/v2/space` 签名请求 → `code:0`；
2. `app.fetchIpLocation(2, '')` 解析成功且无 location；
3. 假 `access_key` 同样无 location（证明返回码不可信）；
4. passport TV `auth_code` 入口 `code:0`；
5. `getWbi()` 在未登录（nav 返回 `-101`）时仍能拿到 `wbi_img` key；
6. 匿名 `acc/info` 被风控拦（`-352`）——说明 wbi 签名与参数结构被服务端接受，只是缺登录态。
预期输出 `6/6 通过`、退出码 0。

## 5. 失败怎么读

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `SyntaxError` + 行号 | 改动破坏语法 | 按行号修；先跑 `node --check` |
| `not ok …` | 断言失败 | 看 `expected/actual`；先复现单测最小用例 |
| `indexedDB is not defined` | jsdom 桩缺失 | 在 setup 注入内存版 `indexedDB` |
| 测试卡住 | `setTimeout` 真实等待 | 用假定时器立即执行 |
| `GM_xmlhttpRequest is not defined` | 启动脚本未注入 | 在 `before` 里挂到 `globalThis` |
| 构建找不到版本 | 头部正则不匹配 | 确认 `@version      1.1.3` 仍在首 15 行 |
| 产物多出差异 | 构建重复注入/换行 | 检查 `@downloadURL` 是否只出现一次 |
| 探针非 0 | 时钟偏差/签名排序/UA/风控 | 校时；打印 `$s` 与 `$sign` 比对 |

## 6. 为什么真实站点测不了

- 仓库与 CI 没有用户的 B 站 Cookie，也没有 `access_key`；`acc/info` 匿名会被 `-352/-403`。
- 匿名 App 接口虽然 `code:0`，但 `space_tag` 没有 `location`，无法验证「有属地」分支。
- 假 key 也返回 `code:0`（见 `RESEARCH.md` §4），返回码不能当断言。
- TV 授权要用户扫码，且可能导致网页端掉线，不能自动化。
- 频繁请求有风控风险，不适合放进 CI。
- 结论：离线单测只测逻辑与桩；真实数据由 `MANUAL-TEST.md` 在浏览器里验收。

## 7. 探针记录

| 日期 | 探针 | 结果 | 备注 |
| --- | --- | --- | --- |
| 2026-11-02 | A | `code:0`，`space_tag` 无 `location` | 30 个 UID 抽样一致（见 `RESEARCH.md` §3） |
| 2026-11-02 | B | `code:0` + `auth_code` | 未继续 confirm/poll（避免影响账号） |
| 2026-11-02 | C | `-403 访问权限不足` / `-352 风控校验失败` | 匿名无登录态，符合预期 |
| 2026-11-02 | D（脚本内置） | `4/4 通过` | `node scripts/probe-app-api.mjs` |
| 待执行 | 手动 | — | `MANUAL-TEST.md`（需登录用户） |
