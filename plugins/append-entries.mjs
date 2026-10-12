/**
 * 把译文追加进 `yayan-zh.mjs` 的 PROSE 表——带完整转义，避免破坏源码。
 *
 * 用法：node append-entries.mjs <translated.json> [<translated.json> ...]
 *
 * 输入 JSON 数组，每项 `{ "text": "英文原文", "zh": "中文译文" }`；也接受
 * `{ "text": "...", "zh": "..." }` 之外的额外字段（忽略）。
 *
 * 安全措施：
 *   - 英文字符串里的未转义 `'` 会转义为 `\'`（此前正是在这里踩过坑：`session's` 直接
 *     拼进单引号字符串会让整份插件语法错误、预设无法挂载）；
 *   - 译文里的换行统一写成 `\n`（保持条目单行，与表内既有条目一致）；
 *   - 反斜杠按需转义，保证还原后与输入逐字一致；
 *   - 命中已有键的条目跳过（幂等），写盘后立即用 `node --check` 复查。
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const files = process.argv.slice(2)
if (files.length === 0) {
	console.error('用法：node append-entries.mjs <translated.json> [...]')
	process.exit(2)
}

const PLUGIN = new URL('./yayan-zh.mjs', import.meta.url)
const path = PLUGIN.pathname.replace(/^\/([A-Za-z]:)/, '$1')

/** 把值编码成能安全放进单引号字符串的字面量内容。 */
const encode = value => value
	.replaceAll('\\', '\\\\')
	.replaceAll("'", "\\'")
	.replaceAll('\n', '\\n')
	.replaceAll('\r', '')

const raw = fs.readFileSync(path, 'utf8')
const lines = raw.split('\n')
const anchor = lines.findIndex(line => line.trim() === '// ── 0.2.1-alpha.2：带动态内容的段落（数字、工具名枚举）──────')
if (anchor < 0) throw new Error('找不到 PATTERNS 定位注释行')

const existing = new Set()
for (const line of lines) {
	if (!line.startsWith("\t['")) continue
	const end = line.endsWith("'],") ? line.length - 3 : (line.endsWith("',") ? line.length - 2 : -1)
	if (end < 0) continue
	existing.add(line.slice(3, end))
}

const insertion = []
let added = 0
let skipped = 0
for (const file of files) {
	const items = JSON.parse(fs.readFileSync(file, 'utf8'))
	if (!Array.isArray(items)) throw new Error(file + ' 不是数组')
	for (const item of items) {
		if (typeof item?.text !== 'string' || typeof item?.zh !== 'string') throw new Error(file + ' 条目缺少 text/zh')
		if (item.zh.trim().length === 0) throw new Error(file + ' 有条目译名为空: ' + item.text.slice(0, 50))
		if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.zh)) throw new Error(file + ' 译文含控制字符: ' + item.text.slice(0, 50))
		const key = encode(item.text)
		if (existing.has(key)) { skipped++; continue }
		existing.add(key)
		insertion.push("\t['" + key + "',")
		insertion.push("\t\t'" + encode(item.zh) + "'],")
		added++
	}
}

if (added === 0) {
	console.log('没有新条目（全部已存在）：跳过 ' + skipped + ' 条')
	process.exit(0)
}

const next = [...lines.slice(0, anchor), ...insertion, ...lines.slice(anchor)]
fs.writeFileSync(path, next.join('\n'), 'utf8')
console.log('追加 ' + added + ' 条，跳过已存在 ' + skipped + ' 条；行数 ' + lines.length + ' -> ' + next.length)
try {
	execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' })
	console.log('node --check: OK')
} catch (error) {
	fs.writeFileSync(path, raw, 'utf8')
	throw new Error('语法检查失败，已回滚：' + String(error.stderr ?? error.message).slice(0, 400))
}
