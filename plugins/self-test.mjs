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
	? [
		{ name: 'read', description: 'Read a UTF-8 text file and return line-numbered content.', parameters: { type: 'object', properties: { file_path: { type: 'string', description: 'Path to read, resolved by the filesystem backend.' } } } },
		// 0.2.1-rc.1 才补进表的两类文本：创造模式启用的 plugin_manager，以及 workflow 的
		// 参数（含嵌套的 meta.phases）。放在内置样本里，防止以后改表时又把它们丢掉。
		{
			name: 'plugin_manager',
			description: 'List plugins or bundles in the current profile, enable or disable them, install a bundle, or remove an installed bundle. Every action requires danger-full-access permission or approval for this call. Approval does not change the session permission mode. Changes affect every session in this profile. List first to obtain exact identifiers. Package installation can execute allowed build scripts. Live profiles apply changes immediately, including upgrades of installed packages; a change result that is not applied carries nextStep, which says what to do or tell the user. Unmet DSH version requirements (engines.dsh, else DSH peer dependencies) block installation and activation. Version exemptions risk crashes and data loss: warn the user and obtain explicit permission for the exact plugin and runtime versions before granting one.',
			parameters: {
				type: 'object',
				properties: {
					action: { type: 'string', description: 'Management operation.' },
					target: { type: 'string', description: 'Plugin entry id, bundle package name, or installation spec, according to action. For an Official catalog entry, pass list_bundles installTarget.spec to install_bundle.' },
					limit: { type: 'number', description: 'List page size, from 1 to 100; defaults to 25.' },
				},
			},
		},
		{
			name: 'workflow',
			description: `Run a JavaScript workflow script that orchestrates subagents at scale. Use this for work that fans out across many independent pieces — an audit over many files, a migration, multi-angle research, adversarial verification of findings — where you write the orchestration as a script instead of delegating turn by turn.

Script-body hooks:
- \`agent(prompt, opts?): Promise<any>\` — run one subagent to completion. Without \`opts.schema\` it resolves to the child's final text; with \`opts.schema\` (an object-rooted JSON Schema using ONLY type/properties/required/additionalProperties/items/enum/const/oneOf) it resolves to the validated object. Resolves \`null\` when the child fails (filter with \`.filter(Boolean)\`). Other opts: \`label\` (display), \`phase\` (progress group), and independent \`provider\`/\`model\` LLM target overrides.
- \`pipeline(items, ...stages): Promise<any[]>\` — run each item through the stages independently with NO barrier between stages (prefer this for multi-stage work). Each stage receives \`(prev, item, index)\`. A stage throw drops that ITEM to \`null\` and skips its remaining stages.
- \`parallel(thunks): Promise<any[]>\` — run zero-argument functions concurrently and await ALL of them (a barrier; use only when a stage genuinely needs every prior result together). A throwing thunk resolves to \`null\`.
- \`phase(title)\` — start a progress phase; \`log(message)\` — narrate progress; \`args\` — the tool call's \`args\` input, verbatim.

Misused hooks (bad arguments, unknown options, unsupported schemas, tripped caps) end the whole script instead of producing \`null\`. The script has no filesystem, network, timer, or Node.js APIs; the agents do the work.`,
			parameters: {
				type: 'object',
				properties: {
					script: { type: 'string', description: 'The plain JavaScript body, not TypeScript and without an `export const meta` statement; top-level await is allowed. End with `return <value>`; the JSON-serializable value is this tool\'s result.' },
					meta: {
						type: 'object',
						description: 'The workflow identity as plain JSON, not code.',
						properties: {
							name: { type: 'string', description: 'Short kebab-case workflow name.' },
							description: { type: 'string', description: 'One-line description of what the workflow does.' },
						},
					},
					args: { type: 'object', description: 'Optional JSON input exposed to the script as the `args` global (wrap a bare list as a field, e.g. {"files": [...]}).' },
				},
			},
		},
	]
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
const add = (text, label) => { if (typeof text === 'string' && text.length > 0 && !originals.has(text)) originals.set(text, label) }
/** 递归收集：`translateTool` 翻的是整棵参数表，嵌套的 `properties` / `items` 同样要检查。 */
const collect = (schema, label) => {
	if (schema === null || typeof schema !== 'object') return
	add(schema.description, label)
	const properties = schema.properties
	if (properties !== null && typeof properties === 'object') {
		for (const [name, property] of Object.entries(properties)) collect(property, label + '.' + name)
	}
	const items = schema.items
	if (items !== null && typeof items === 'object') collect(items, label + '[]')
}
for (const tool of tools) {
	if (tool === null || typeof tool !== 'object' || typeof tool.name !== 'string') continue
	add(tool.description, tool.name)
	collect(tool.parameters, tool.name)
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
		'- `office`: Create, edit, inspect, or convert Office documents, spreadsheets, presentations, and PDFs. Load to choose the relevant workflow.',
		'- `office-docx`: Create, read, edit, and validate Word documents (.docx).',
		'- `office-xlsx`: Read, create, edit, and validate Excel workbooks, data, and formulas (.xlsx).',
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
