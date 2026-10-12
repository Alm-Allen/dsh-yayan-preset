/**
 * 运行时工具 schema 覆盖率检查：拿 Host 实际发布的工具清单喂给本插件。
 *
 * 与 `audit-coverage.mjs`（扫 DSH 源码找英文原文）互补：这里用的是**当前 Host 真正
 * 发给模型的 schema**，所以测到的是 standard 模式下的真实到达面，不需要推断工具集。
 *
 * 用法：node audit-runtime-tools.mjs <工具清单 JSON 文件>
 *   工具清单来自 Host `Tool` Inspect provider 的 `listTools`——它的 `data.tools` 就是
 *   每个工具的 name / description / parameters。把那份 JSON（带 `{ platform, provider,
 *   method, data }` 外壳的那一层）存成文件传进来即可；只给 `data.tools` 也能解析。
 *
 * 只读：不接触 Host，也不改任何文件。
 */
import fs from 'node:fs'

const file = process.argv[2]
if (file === undefined || file.length === 0) {
	console.error('用法：node audit-runtime-tools.mjs <工具清单 JSON 文件>')
	process.exit(2)
}

const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
const tools = Array.isArray(raw) ? raw : (raw?.data?.tools ?? raw?.tools ?? [])
if (!Array.isArray(tools) || tools.length === 0) throw new Error('没有从清单里解出 tools 数组')

const mod = await import(new URL('./yayan-zh.mjs', import.meta.url).href)
if (typeof mod.apply !== 'function') throw new Error('yayan-zh.mjs 未导出 apply')

let handler
mod.apply({
	on: (event, fn) => { if (event === 'system-prompt/assemble') handler = fn },
})
if (handler === undefined) throw new Error('未注册 system-prompt/assemble 监听')

/** 把一份工具 schema 过一遍插件的 assemble 钩子，取回翻译后的同名工具。 */
const through = async tool => {
	const out = await handler(null, null, async () => ({ sections: [], contexts: [], tools: [tool], variables: { provider: 'p', model: 'm' } }))
	return out.tools[0]
}

const CJA = /[\u4e00-\u9fff]/
const collected = new Set()
const untranslated = []

for (const tool of tools) {
	if (tool === null || typeof tool !== 'object' || typeof tool.name !== 'string') continue
	if (collected.has(tool.name)) continue
	collected.add(tool.name)
	const after = await through(tool)
	const items = [
		['description', tool.description, after.description],
	]
	const beforeProps = tool.parameters?.properties
	const afterProps = after.parameters?.properties
	if (beforeProps !== null && typeof beforeProps === 'object') {
		for (const [name, property] of Object.entries(beforeProps)) {
			items.push([
				'parameters.' + name + '.description',
				property?.description,
				afterProps?.[name]?.description,
			])
		}
	}
	for (const [where, before, now] of items) {
		if (typeof before !== 'string' || before.length === 0) continue
		if (CJA.test(before)) continue
		if (before.trim() === '') continue
		if (before !== now) continue
		untranslated.push({ tool: tool.name, where, text: before })
	}
}

console.log('工具总数: ' + collected.size + '（清单里 ' + tools.length + ' 条）')
console.log('未汉化的描述条目: ' + untranslated.length)
console.log('')
for (const item of untranslated) {
	console.log('[' + item.tool + '] ' + item.where)
	console.log('   ' + item.text.slice(0, 220))
}
if (untranslated.length === 0) console.log('（全部命中翻译表）')
