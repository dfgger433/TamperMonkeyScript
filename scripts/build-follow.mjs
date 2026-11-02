// 构建「BiliBili 关注管理」安装用 userscript：
// BilibiliFollowManage.js（源文件，仓库里维护） → dist/BiliBili 关注管理-<version>.user.js
// 差异仅：插入 GreasyFork 的 @downloadURL / @updateURL 两行（发布脚本需要）。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'BilibiliFollowManage.js')
const DIST = join(ROOT, 'dist')

const GREASYFORK = 'https://update.greasyfork.org/scripts/537856/BiliBili%20%E5%85%B3%E6%B3%A8%E7%AE%A1%E7%90%86'

const source = readFileSync(SOURCE, 'utf8')
const version = (source.match(/^\/\/ @version\s+(\S+)/m) || [])[1]
if (!version) throw new Error('未找到 @version')

const headerEnd = '// ==/UserScript=='
if (!source.includes(headerEnd)) throw new Error('未找到 ==/UserScript== 头结束标记')

let output = source
if (!output.includes('@downloadURL')) {
  const extra = [
    `// @downloadURL ${GREASYFORK}.user.js`,
    `// @updateURL ${GREASYFORK}.meta.js`,
  ].join('\n')
  output = output.replace(headerEnd, `${extra}\n${headerEnd}`)
}

mkdirSync(DIST, { recursive: true })
const target = join(DIST, `BiliBili 关注管理-${version}.user.js`)
writeFileSync(target, output, 'utf8')

console.log(`[build:follow] ${version} -> ${target} (${Buffer.byteLength(output)} bytes)`)
