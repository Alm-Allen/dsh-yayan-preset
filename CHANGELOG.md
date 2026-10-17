# 更新记录

按版本从新到旧。每段标题就是 tag 名（`## [2026.10.12] - 2026-10-12`）——推 tag 时由
`.github/workflows/release.yml` 把这一段抽出来当 Release 报告。
所以发版的规矩只有一条：**先在文件顶上补一段，再打标签**。抽不到那一段（或那一段是空的），
Release 就退回 GitHub 自动生成的提交清单。

版本号用日期式（`2026.10.12`），与 `package.json` 的 `version`、tag 名同号。

## [2026.10.17] - 2026-10-17

### 适配 dsh 0.2.1-rc.1

- 基准版本收敛为 **0.2.1-rc.1**（Web 的全局 npm 包与 Desktop 内置运行时都是它）。shipped
  `standard` 逐行重述时补上 `tool-schedule` 与 `tool-plugin-market`，删除 rc.2 遗留的
  `tool-subagent-codex` / `tool-subagent-claude-code` / `tool-ralph` 三行，按 rc.1 的 shipped
  去掉 subagent 的 `backgroundMode`；plan-mode 首句按 rc.1 措辞重译。
- 补译 rc.1 新增的提示词：`plugin_manager` / `plugin_market` 的整条工具描述与参数、
  `workflow` 的顶层与嵌套参数（`meta.phases`）、`bash` 的 guidance 与描述，以及 office
  技能拆成 7 个入口后的全部新描述。
- `translateTool` 改为递归翻译整棵参数表（原来只翻顶层，`workflow.meta.*` 这类嵌套描述会漏）。
- `audit-coverage.mjs` 修掉误指向 `cangjie-zh.mjs` 的路径，并对工具文本同时测 schema 路径
  与 JSDoc 路径，减少假缺口。
- `self-test.mjs` 内置样本加入 `plugin_manager`、`workflow`（含嵌套参数）与 office 新描述，
  覆盖率保持 100%。

### 补遗：装上之后仍有英文的三处缺口

- `harness:source` 与 `app:web-surface` 两段说明：rc.1 把「实现代码检出目录」与「Web GUI URL」
  挪进运行时上下文，段落本体改成 path-free 的固定文案，旧表只认带路径的版本——补上两段新原文。
- `schedule` 参数说明：rc.1 改写了 task title 的措辞（`Concise task name in the user's language…`、
  `New task name; follow the schedule_create title rules.`），并新增两条 `HH:mm:ss`、
  `UTC or IANA Area/Location`、`ISO weekdays` 四条参数说明；含 JSDoc 闭合符的 `cron` 那条走
  `DOCS` 层。
- 运行时上下文的三条动态条目（`Current working directory`、实现代码检出目录、Web GUI URL）
  补正则映射。

## [2026.10.12] - 2026-10-12

### 以 dsh 插件包发布

- 雅言模式不再靠 `install-yayan.ps1` 安装：本仓库就是一个 dsh 插件（bundle），
  `package.json` 的 `dsh.bundle.patch` 指向包内 `cordis.patch.yml`，后者按 Loader 行 id
  **覆盖**随 dsh 出货的 `preset-standard`。安装、更新、卸载全部交给 dsh 自己的插件管理
  （插件页，或 `dsh plugin --profile <p> add github:Alm-Allen/dsh-yayan-preset`）。
- 汉化层 `yayan-zh.mjs` 放在包内 `plugins/`，同时是包入口；预设内部那一行按**包名**引用——
  预设里的行由挂载该预设的 Loader 以 profile 目录为解析基准，写相对路径会指向不存在的地方。
- 插件本体 413672 字节 / 2289 行，sha256 前 16 位 `5009A0D7566DA186`。
- 维护与审计脚本一并进包：`append-entries.mjs`（追加译文，带转义与 `node --check` 回滚）、
  `self-test.mjs`、`audit-coverage.mjs`、`audit-runtime-tools.mjs`，用法见 README。
- 旧的 ps1 安装器、素材与旧文档不在本仓库（收在检出目录里被 git 忽略的 `归档/` 下）。

### 覆盖原生 standard 预设，不新增预设条目

- `cordis.patch.yml` 按 Loader 行 id 覆盖 `@deepseek-ai/dsh-web-app` 那份 `preset-standard`：
  顶层 `- id: preset-standard` 且不带 `insert`，即 Loader 的 override 语义——替换既有行的
  字段，而 `config` 是**整体替换、绝不深合并**，所以 upstream 那份 `plugins` 列表必须完整
  重述。
- 效果：「设置 → Agent 预设」里仍然只有原生的**标准模式**，名字、位置、`config.id` 全部照旧，
  本包只换掉它加载的插件列表（多一个中文化层 `yayan-zh`，persona 置空）。预设列表**不会多出
  条目**；停用或卸载本包即恢复原版。dsh 自己会在组合结果里标注归因：
  `# == @deepseek-ai/dsh-web-app, patched by @alm-allen/dsh-yayan-preset`。
- 两版兼容（一份 patch 同时服务 0.2.0-rc.2 与 0.2.1-alpha.2），基准取 **0.2.0-rc.2** 的
  shipped 逐行重述。两版 shipped 的差异已核对：rc.2 有 `tool-subagent-codex` /
  `tool-subagent-claude-code` / `tool-ralph`（本来就 `disabled: true`，保留无害），alpha.2
  没有这三行，改挂 `time-context` 与 `tool-schedule`，并给两个 subagent 行加了 `toolFilter`。
- `tool-schedule` **故意不收录**：rc.2 的包里没有 `@deepseek-ai/dsh-tool-schedule`（只有
  `dsh-schedule`），而一行引用不到的包会让整个预设激活失败、组不成会话。代价是 Desktop 上少
  一个 schedule 工具行（属可选能力，且 shipped 本身也对 subagent `deny` 了它）。`time-context`
  两版都有包故收录，Desktop 因此不比原生标准模式少这项；alpha.2 的 `toolFilter` 未跟随——
  它在 rc.2 的 schema 里未必被接受，而不 deny 的唯一后果是 subagent 可能多看到几个 schedule
  工具，本文件根本没挂那几行。
- 与 shipped 逐行对齐：`tool-plugin-manager` 保持挂载，`tool-ralph` 保持 `disabled: true`；
  并删掉中文的 `name` / `description`，让显示名保持原生。
- 缓存与注入审查：`dsh-agent-loop` 的 `RuntimeContextProjection.project()` 拿「自己渲染出的
  文本」与「已落地文本」逐字比较，不等才追加一条 user 消息——两侧同源时恒等、永不重发，
  只改一侧就会每个 step 追加一条。汉化层只改 `system-prompt/assemble` 的渲染侧（落地即同一份
  文本），`translateMessage` 也只处理 `<system-reminder>` 开头的注入块。`time-context` 走
  `agent/pre-step` 追加独立 user 消息、默认 10 分钟最小间隔，官方文档明确「仅追加；新可见内容
  位于可复用请求前缀之后，不会使现有 KV Cache 条目失效」，且其文本不经过翻译层。persona 置空
  顺带修掉了 shipped 本身的缓存漏洞——原生 standard 的 persona suffix 含 `{{cwd}}`，会让系统
  提示词随工作目录变化。

### 精简中文提示词

- 把 agent 不需要知道的实现细节与「关于提示词自身构造」的元说明从译文里删掉，共 9 处，
  表内译文净减 652 字符。实现细节类：Web GUI 段的 HMR 接收器 / `pnpm run dev:web` /
  apps/web 的 Vite 入口 / `window.__DSH_BOOT__` / 替代服务器与 `DSH_WEB_URL` 的来历说明
  （470 字压到 65 字）、检出目录那段的「不要从这个路径推断工作目录，用 pwd 确定当前工作目录」、
  三个 office 技能描述里各重复一遍的 LibreOffice 说明。元说明类：硬边界标题后的括号、
  提问纪律里的多处口号、指向短版工具描述的「完整纪律见 ask_user_question 的说明」、
  工作目录那句「不写在提示词里」、批量化小节末尾关于「另一种工具呈现方式」的解释。
- 刻意保留两处契约：身份段的「提问而不是内耗」小标题（`self-test.mjs` 的
  `DISCIPLINE_MARKERS` 断言它）、批量化小节的结尾「不用去找它。」（`pinDiscipline` 的
  `BATCH_END` 靠它定位剥除区间）。
