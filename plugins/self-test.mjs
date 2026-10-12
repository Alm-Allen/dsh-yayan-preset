/**
 * 雅言模式自测：拿**当前 Host 真实发布的工具 schema** 验证 yayan-zh 的中文化覆盖率，
 * 同时守住四条会让会话直接不可用或持续退化的纪律。
 *
 * 用法：node self-test.mjs <工具清单 JSON 文件>
 *   工具清单来自 Host `Tool` Inspect provider 的 `listTools`（存成文件即可）。
 *   不给参数时只跑内置的最小样本。
 *
 * 与仓颉版 self-test 的差别：那个用 PTC 的提示词快照（段落为主），这个用标准模式下真正的
 * 到达面——**每个工具的 schema**。标准模式没有 `tools:sdk` 段，工具描述只出现在工具 schema
 * 里，所以这里把每个工具逐个过一遍 `system-prompt/assemble`。
 *
 * 守住的纪律：
 *   1. section 数量不变（身份段走按名注入，不该落到"补一段"的兜底分支）；
 *   2. 会被 harness 插值的 section 里不许留下未注册变量（否则整份提示词组装抛错）；
 *   3. 翻译幂等（同一输入两次结果逐字相同，否则每个 step 的前缀都会漂移）；
 *   4. 系统提示词与工作目录无关（换目录后 sections 与 tools 逐字节相同，即缓存契约）。
 *
 * 未汉化条目分三类报告，处置方式不同：
 *   [miss]  表里确实没有这条原文——补表；
 *   [escape] 表里有这条原文，但它含会被源码转义的字符（`\`、`'`），精确匹配因此失效；
 *   [drift] 表里只有前缀相同、长度相近的旧版原文——上游改写了措辞，按新原文补表。
 */
import fs from 'node:fs'

const listFile = process.argv[2]
const mod = await import(new URL('./yayan-zh.mjs', import.meta.url).href)
if (typeof mod.apply !== 'function') throw new Error('yayan-zh.mjs 未导出 apply')

let handler
let stepHandler
mod.apply({
	on: (event, fn) => {
		if (event === 'system-prompt/assemble') handler = fn
		if (event === 'agent/pre-step') stepHandler = fn
	},
})
if (handler === undefined) throw new Error('未注册 system-prompt/assemble 监听')

const IDENTITY_EN = 'You are an AI agent powered by DeepSeek Harness.'
const CJK = /[\u4e00-\u9fff]/

const tools = listFile === undefined
	? [{ name: 'read', description: 'Read a UTF-8 text file and return line-numbered content.', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'Path to read, resolved by the filesystem backend.' } } } }]
	: (() => {
		const raw = JSON.parse(fs.readFileSync(listFile, 'utf8'))
		const list = Array.isArray(raw) ? raw : (raw?.data?.tools ?? raw?.tools ?? [])
		if (!Array.isArray(list) || list.length === 0) throw new Error('没有从清单里解出 tools 数组')
		return list
	})()

const cwd = process.cwd()
/** 真实组装里的工作目录上下文：名字与形状见 `dsh-working-directory` 的 `contextText()`。 */
const workdirContext = directory => ({ name: 'working-directory:current', text: `Current working directory: ${JSON.stringify(directory)}.`, interpolate: false })
const contexts = [workdirContext(cwd)]
const sections = [
	{ name: 'harness:identity', text: IDENTITY_EN },
	{ name: 'probe', text: 'Tokens prefixed with @ are workspace paths the user explicitly referenced, relative to the workspace root.' },
]
const variables = { provider: 'deepseek', model: 'deepseek-flash' }

/** 用指定工作目录跑一次组装：身份段不该因此有任何变化。 */
const assemble = async (workdir = cwd) => handler(null, null, async () => ({
	sections,
	contexts: [workdirContext(workdir)],
	tools,
	variables,
}))
const first = await assemble()
const second = await assemble()

// ── 1. 身份段与 section 数量 ──────────────────────────────────────────────────
if (first.sections.length !== sections.length) {
	throw new Error('section 数量被改变：' + sections.length + ' -> ' + first.sections.length + '（身份段应走按名注入）')
}
const identity = first.sections.find(section => section.name === 'harness:identity')
if (identity === undefined) throw new Error('身份段丢失')
if (identity.interpolate !== false) throw new Error('身份段没有钉 interpolate: false')
// 「缓存契约」：身份段位于系统提示词最前面（order -1000），一旦嵌了工作目录这类环境值，
// 每个项目目录都会得到一份不同的系统提示词，前缀缓存从第一个变化的 token 起全部失效。
// 工作目录由 runtime 上下文（用户消息）携带，不需要也不应该写进身份段。
if (identity.text.includes(cwd)) throw new Error('身份段里嵌了工作目录，系统提示词会随项目变化：' + cwd)
if (identity.text.includes('{{')) throw new Error('身份段里留下了提示词变量占位符')
if (!identity.text.includes('行动边界')) throw new Error('身份段没有注入行为纪律')

const DISCIPLINE_MARKERS = ['行动边界', '停下来先问的硬边界', '提问而不是内耗', '批量化调用工具']
for (const marker of DISCIPLINE_MARKERS) {
	if (!identity.text.includes(marker)) throw new Error('身份段缺少纪律小节：' + marker)
}
console.log('身份段：按名注入，含 ' + DISCIPLINE_MARKERS.length + ' 项纪律，interpolate=false，无工作目录等环境文本')

// ── 2. 变量检查（照 harness 的规则复查）──────────────────────────────────────
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/
const variableProblems = []
for (const section of first.sections) {
	if (section.interpolate === false) continue
	for (const matched of String(section.text).matchAll(/\{\{([^{}]*)\}\}/g)) {
		const name = matched[1]
		if (!VARIABLE_NAME.test(name)) variableProblems.push(section.name + ': "{{' + name + '}}" 不是合法变量名')
		else if (!(name in variables)) variableProblems.push(section.name + ': "{{' + name + '}}" 未注册')
	}
}
if (variableProblems.length > 0) {
	console.log('=== 会让组装失败的提示词变量（' + variableProblems.length + '）===')
	for (const problem of variableProblems) console.log('  ' + problem)
	process.exitCode = 1
} else {
	console.log('未注册变量检查：通过')
}

// ── 3. 幂等 + 环境无关性（缓存契约）─────────────────────────────────────────
if (JSON.stringify(first) !== JSON.stringify(second)) throw new Error('翻译不幂等：两次结果不同')
console.log('幂等：通过（同一输入两次结果逐字相同）')

// 换一个工作目录重新组装，系统提示词（sections + tools）必须逐字节相同。这条断言直接挡住
// "身份段里嵌工作目录"这类回归——那会让每个项目各有一份提示词，前缀缓存从第一个变化的
// token 起全部失效。注意只比较 sections/tools：工作目录本身属于**上下文**（用户消息），
// 它本来就该跟着会话走。
const otherCwd = process.platform === 'win32' ? 'D:\\another\\project' : '/home/someone/another-project'
const elsewhere = await assemble(otherCwd)
if (JSON.stringify([elsewhere.sections, elsewhere.tools]) !== JSON.stringify([first.sections, first.tools])) {
	throw new Error('系统提示词随工作目录变化：身份段里还有环境相关文本')
}
console.log('环境无关性：换工作目录（' + otherCwd + '）后，sections 与 tools 逐字节相同')

// ── 4. 工具 schema 覆盖率 ────────────────────────────────────────────────────
const tableText = fs.readFileSync(new URL('./yayan-zh.mjs', import.meta.url), 'utf8')

/** 收集工具 schema 里所有待翻译文本：原文 -> 标签（同名文本只保留首次出现的标签）。 */
const originals = new Map()
for (const tool of tools) {
	if (tool === null || typeof tool !== 'object' || typeof tool.name !== 'string') continue
	const add = (text, label) => { if (typeof text === 'string' && text.length > 0 && !originals.has(text)) originals.set(text, label) }
	add(tool.description, tool.name)
	const properties = tool.parameters?.properties
	if (properties !== null && typeof properties === 'object') {
		for (const [name, property] of Object.entries(properties)) add(property?.description, tool.name + '.' + name)
	}
}

/**
 * 逐条过一遍**真实的翻译路径**（工具 schema，与标准模式完全一致）。
 * 译文与原文相同 = 没被翻译；此时再看表里有没有这条原文，区分"该补表"与"被转义"。
 */
const missing = []
const escaped = []
let alreadyChinese = 0
let hit = 0
for (const [text, label] of originals) {
	if (CJK.test(text)) { alreadyChinese++; continue }
	const probe = { name: 'probe', description: text, parameters: { type: 'object', properties: {} } }
	const after = await handler(null, null, async () => ({ sections: [], contexts: [], tools: [probe], variables }))
	if (after.tools[0].description !== text) { hit++; continue }
	if (tableText.includes(text)) missing.push({ label, text })
	else escaped.push({ label, text })
}
const total = originals.size
console.log('')
console.log('工具 schema 文本: 去重 ' + total + ' 条')
console.log('  已汉化: ' + hit)
console.log('  原本就是中文: ' + alreadyChinese)
console.log('  未汉化·表里确实没有这条原文 [miss]: ' + missing.length)
console.log('  未汉化·表里有原文却没命中（转义或版本漂移）[escape/drift]: ' + escaped.length)
for (const item of missing.slice(0, 30)) console.log('    [miss] ' + item.label + ' :: ' + item.text.slice(0, 100))
for (const item of escaped.slice(0, 12)) console.log('    [escape/drift] ' + item.label + ' :: ' + item.text.slice(0, 100))
console.log('')
console.log('覆盖率: ' + (((hit + alreadyChinese) / Math.max(1, total)) * 100).toFixed(1) + '%')

// ── 5. 技能目录路径（`agent/pre-step`）与幂等 ────────────────────────────────
if (stepHandler !== undefined) {
	const CATALOG = [
		'<system-reminder>',
		'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
		'',
		'<available_skills>',
		'- `office-docx`: Create, read, edit, and check Word documents (.docx), including reports, letters, and formatted tables. Use when a DOCX file is an input or requested deliverable.',
		'</available_skills>',
		'',
		'</system-reminder>',
	].join('\n')
	const runStep = async text => {
		const decision = await stepHandler(null, async () => ({ kind: 'continue', messages: [{ id: 'm1', role: 'user', content: [{ type: 'text', text }] }] }))
		return decision.messages[0].content[0].text
	}
	const once = await runStep(CATALOG)
	const twice = await runStep(once)
	if (once === CATALOG) throw new Error('技能目录没有被翻译')
	if (twice !== once) throw new Error('技能目录翻译不幂等')
	console.log('技能目录：已翻译且幂等')
}
