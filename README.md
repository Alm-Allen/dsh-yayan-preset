# dsh-yayan-preset

把 **DeepSeek Harness（dsh）** 的原生 **标准模式（standard）** 汉化：装上本包之后，标准模式
本身就说中文——系统提示词与全部工具描述汉化，模型以中文思维链工作，工具仍按 standard 的方式
**直接调用**（没有 `run_code` 这层中介，每个工具都是独立 schema）。

本包**不新增预设条目**，而是按 Loader 行 id **覆盖**随 dsh 出货的 `preset-standard`：预设列表里
仍然只有原生的「标准模式」，名字、位置、`config.id` 全部照旧，被换掉的只是它加载的插件列表
（多一个中文化层 `yayan-zh`）。停用或卸载本包即恢复原版。

和仓颉模式（[dsh-cangjie-preset](https://github.com/Alm-Allen/dsh-cangjie-preset)）是同一套汉化机制、同一张翻译表。
差别只在**挂载对象**：雅言覆盖原生 `standard`（标准模式），仓颉覆盖原生 `ptc`（PTC 模式）。
前者按 `mode: native` 把每个工具的 schema 直接发布给模型；后者按 `mode: ptc` 把工具包成
TypeScript SDK，模型写一段程序来调用它们。

本仓库是一个 **dsh 插件（bundle）**，不是安装脚本：`package.json` 里的 `dsh.bundle.patch`
指向包内的 `cordis.patch.yml`，后者覆盖 `preset-standard` 那一行。安装、更新、卸载都交给
dsh 自己的插件管理。

## 安装

**插件页**：打开 dsh 的 **插件** 页 → **添加插件** → 输入

```
github:Alm-Allen/dsh-yayan-preset
```

**命令行**（`--profile` 换成你的 profile 名，网页端通常是 `web`）：

```sh
dsh plugin --profile web add github:Alm-Allen/dsh-yayan-preset

# 锁死到某个 commit —— 后续推送就改不了你装到的东西
dsh plugin --profile web add github:Alm-Allen/dsh-yayan-preset#<commit-sha>
```

装完重启 dsh、刷新页面即可——**不需要再选预设**：`standard` 本来就是默认预设，被覆盖之后它
自己就是中文的。到 **设置 → Agent 预设** 里看到的仍是原生「标准模式」，不会多出条目。

- **桌面端**：桌面应用的 profile 是 `desktop`，CLI 对它有额外限制（要先完全退出应用再执行）。
  桌面端直接用**插件**页添加最省事。
- **本地改着玩**：`dsh plugin --profile web add link:<本仓库绝对路径>` 装的是符号链接，
  改完重启即生效。
- **不用它了**：`dsh plugin --profile web remove @alm-allen/dsh-yayan-preset`，
  或直接在插件页停用/卸载。

升级到最新：

```sh
dsh plugin --profile web update @alm-allen/dsh-yayan-preset
```

## 装过更早的版本的话

更早的版本靠一键安装脚本装本预设，它和本包**不要同时用**：那套装法会在 profile 的**用户层**留下
同 id（`preset-yayan`）的声明。本包自「覆盖原生 standard」这版起不再声明 `preset-yayan`，所以
两者并存不会撞行 id，但那条旧声明会继续往预设列表里塞一个独立的「雅言模式」条目——要的就是
单一入口的话，先用那套脚本自带的回滚方式把它卸干净。

## 包结构

```
dsh-yayan-preset/
├── package.json                插件清单：name、exports、dsh.bundle.patch
├── cordis.patch.yml            本包贡献的组合层：覆盖原生 preset-standard 声明
└── plugins/
    ├── yayan-zh.mjs            汉化层插件本体（零外部 import），同时也是包的入口
    ├── self-test.mjs           离线自测：翻译覆盖率、纪律注入、缓存契约
    ├── audit-coverage.mjs      覆盖率审计：扫 DSH 源码原文，列出漏译条目
    ├── audit-runtime-tools.mjs 运行时工具集审计（对照实际发布给模型的工具 schema）
    └── append-entries.mjs      维护工具：把译文安全追加进 PROSE 表（转义 + node --check + 失败回滚）
```

## 装进 profile 之后发生了什么

1. dsh 把包装到 `<profile>/node_modules/`，并把包名写进 `dsh.profile.bundles`——这一步由
   `@deepseek-ai/dsh-plugin-manager` 完成，`dsh plugin` 与插件页是同一条路径；
2. 启动组合时，本包的 `cordis.patch.yml` 作为一层，在 profile 自有 `cordis.patch.yml`
   **之前**应用（顺序见 `@deepseek-ai/dsh-app-boot` 的 profile 装载：各 bundle 的 patch →
   profile 自己的 patch → launcher 的 `--patch`）。本包排在 `@deepseek-ai/dsh-web-app`
   **之后**，所以能覆盖后者 `insert` 出来的 `preset-standard`；dsh 的组合结果里会标注
   `# == @deepseek-ai/dsh-web-app, patched by @alm-allen/dsh-yayan-preset`；
3. 预设内部那一行按**包名**解析到包入口 `plugins/yayan-zh.mjs`：它挂在
   `system-prompt/assemble` 瀑布（提示词与工具 schema）与 `agent/pre-step`（技能目录等注入块）
   上，只做文本替换；
4. 预设是 **agent 平面**的组合：它在 roster 的 standing scope 下挂载一次，选择本预设的会话按
   scope 父子关系加入；各注册表、沙箱与审批栈、持久化、模型路由仍留在宿主组合里，不受影响。

装本包不动你的默认预设**设置**，但它改的是默认预设的**内容**：只要默认（或当前会话所选）的是
「标准模式」，装完重启就是中文的，不需要额外操作。要回退就在插件页停用/卸载本包。

## 自测

```sh
# 用一份系统提示词快照验证翻译覆盖率（不给参数则用内置样本）
node plugins/self-test.mjs <一份系统提示词快照.md>
# 换个方向：扫 DSH 源码里的英文原文，列出没被翻到的条目
node plugins/audit-coverage.mjs <DSH 源码检出目录>
# 对照实际发布给模型的工具 schema 审计
node plugins/audit-runtime-tools.mjs <工具 schema 快照文件>
```

装进 profile 之后，路径换成：

```powershell
node "$env:USERPROFILE\.dsh\profiles\web\node_modules\@alm-allen\dsh-yayan-preset\plugins\self-test.mjs"
```

`self-test.mjs` 列出**仍为英文的行**：正常情况下只剩 TypeScript 类型声明、枚举字面量，以及那条
**故意保留英文**的工作目录上下文（它属于用户消息里的运行时上下文，不是系统提示词）。它同时断言
section 数量不变、无未注册变量、翻译幂等，以及**换一个工作目录后 sections 与 tools 逐字节不变**
（前缀缓存契约）。

## 汉化是怎么做的

`yayan-zh.mjs` 监听 Cordis 的 `system-prompt/assemble` 瀑布：`await next()` 拿到下游全部贡献
之后的最终装配结果，本插件只做**文本替换**，不改结构、不改顺序、不增删 section。

相对仓颉版，本文件只做两件事：删掉只可能在 PTC 提示词里出现的 `run_code` / `tools:sdk` 专有条目；
其余条目与全部机制原样保留——尤其是逐工具翻译 schema 的 `translateTool`，它正是标准模式下翻译
生效的主路径。

替换分四层：精确段落映射 → 正则映射（含路径、URL、数字的动态文本）→ JSDoc 注释映射（跨模式共用
同一张表而保留的兜底）→ 长段落内的子串替换。**只替换已知的英文原文**，未知文本原样保留，
所以 dsh 升级后新增的工具或段落会以英文出现，而不会被破坏或丢失。

身份段（行为纪律、提问纪律、文件与调用纪律）是唯一的例外：它由插件按 section 名
`harness:identity` 直接写入，不依赖英文原文匹配——上游改写那句话也不会让纪律静默消失。
身份段正文是**与环境无关的常量**：不写工作目录、时间、时区，也不引用任何提示词变量，
写进 section 时钉 `interpolate: false`，所以同一部署内系统提示词前缀恒定。

## 兼容性

- 零第三方依赖、零构建步骤：仓库里放的就是最终产物，所以 `github:` 直装不需要任何构建授权。
- 翻译表按 **0.2.1-rc.1** 的提示词逐条核对并适配；上游再次改写提示词时，未知文本原样保留为
  英文，用上面的自测（看真实提示词）或审计（看源码全量）自查。
- **基准版本是 0.2.1-rc.1**（Web 的全局 npm 包与 Desktop 内置运行时都是它）。`cordis.patch.yml`
  以该版 shipped `standard` 逐行重述：收录 `tool-schedule` 与 `tool-plugin-market`，不再保留
  rc.2 时代的 `tool-subagent-codex` / `tool-subagent-claude-code` / `tool-ralph` 三行。
- **升级 dsh 后要回头核对**：override 冻结整份 `config`，shipped 文件若新增或改动了插件行，
  本包不会自动跟随。升级后把 `cordis.patch.yml` 与 `dsh-web-app/presets/standard.patch.yml`
  对一遍（桌面端该文件在 `app.asar` 内，shell 打不开，但 dsh 自己的 read 工具能读）。
- 本包不声明任何 `@deepseek-ai/dsh*` 的 peer，因此不会被 dsh 的插件兼容性预检拦下；
  它也不注册服务、不碰沙箱与审批栈、不写任何全局配置。

## 更新记录

每个版本的更新记录在 [CHANGELOG.md](./CHANGELOG.md)——打标签发布时，Release 报告就是从它里面抽的。

## 许可

MIT
