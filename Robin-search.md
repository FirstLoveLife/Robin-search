# Robin-search — VS Code 插件需求与设计文档（Appendable Search Results Buffer）

> 目标：在 VS Code 里实现类似 Source Insight 的“Search Results buffer”：多次搜索结果可追加（append）到同一个可编辑 buffer，并按“results set”分段；每条结果可点击跳转到源码位置；buffer 可保存、可复用、可继续追加。

---

## 1. 背景与目标

你需要一种“持续增长的搜索结果缓冲区（buffer）”：

- 一次 search 把结果写进去  
- 下一次 search 可以选择 append 到同一个 buffer 的末尾  
- 每次 search 作为一个独立 results set（带标题/统计/分隔符）  
- 结果条目可点击跳转到 `file:line:col`  
- buffer 本身是普通文本，可编辑（删行、加注释、整理）

VS Code 原生 **Search Editor** 更偏“一次搜索一个独立对象”，缺少“append 新结果到同一 buffer”的工作流，因此需要插件自实现一个“可编辑 + 可持续 append + 可跳转”的结果文档类型。

**成功标准（一句话）**：把搜索结果当作可编辑的、可积累的“证据池”。

---

## 2. 用户故事（User Stories）

1. 我在大 repo 做多轮搜索（不同 pattern/范围），希望把多轮结果累积在同一个 buffer 里，便于对照、筛选、手动标注。
2. 我希望每轮搜索结果都有清晰分隔、统计信息，并能折叠/导航（可选）。
3. 我希望点击任意结果行能跳到对应文件与命中位置。
4. 我希望把当前 buffer 保存成文件，下次还能继续 append。
5. 我希望结果很多时不会卡死：要能取消，要有上限与截断提示。

---

## 3. 非目标（Non-goals）

- 不复刻 VS Code Search View 的全部能力（复杂 Replace UI 等）。
- 不保证旧结果随着代码变化自动更新（旧结果视为历史快照）。
- 不保证用户手工把格式改坏后仍 100% 可跳转（但要尽量容错，不崩溃）。

---

## 4. 核心交互与命令（Commands）

建议命令均可通过 Command Palette 使用，默认不绑快捷键（用户可自定义）。

### 4.1 Buffer 生命周期

- `Robin-search: Create Buffer`
	- 创建并打开一个新的 results buffer 文档。
	- 默认在 workspace 内创建：`.vscode/robin-search/<name>.asr`（可配置）。
- `Robin-search: Open Buffer`
	- 选择并打开已有 `.asr` buffer。

### 4.2 搜索写入策略

- `Robin-search: Search (Append)`
	- 搜索并将结果 **append** 到当前目标 buffer 末尾，形成一个新的 results set。
- `Robin-search: Search (Replace)`
	- 清空目标 buffer，写入新的 results set（覆盖）。
- `Robin-search: Search (New Buffer)`
	- 创建新 buffer 并写入本次结果。

### 4.3 Buffer 管理

- `Robin-search: Clear Buffer`
	- 清空 buffer 内容（保留文件）。
- `Robin-search: Pin Buffer`（可选）
	- 将某个 buffer 设为“默认目标 buffer”（即使焦点不在该文档，append 也写进去）。
- `Robin-search: Unpin Buffer`（可选）

### 4.4 导航（可选但强烈建议）

- `Robin-search: Next Match` / `Previous Match`
- `Robin-search: Open Match At Cursor`

---

## 5. 搜索功能需求（Functional Requirements）

### 5.1 搜索范围

- 默认：当前 workspace（multi-root 时包含所有 folder）。
- 支持 include/exclude glob（VS Code glob 规则）。
- 支持是否尊重 `search.exclude`/`files.exclude`（可配置）。

### 5.2 Pattern 类型

- literal（默认）
- regex（可选）
- whole word（可选）
- case sensitive（可选）

### 5.3 结果条目内容

每条 match 至少包含：

- 相对路径（显示用，尽量相对 workspace root）
- line number（1-based）
- column（1-based，能拿到就写；拿不到可省略）
- preview（命中行文本，截断显示）

### 5.4 写入策略

- Replace：覆盖整个 buffer
- Append：末尾追加一个新 results set
- New buffer：新建 buffer 并写入

### 5.5 取消与上限

- 必须支持 cancel（取消 token）。
- `maxResults`：达到上限后停止并标记 `TRUNCATED=true`。
- `maxMatchesPerFile`：避免单文件海量命中导致卡顿。
- `maxFileSizeKB`：跳过超大文件。

---

## 6. 结果 buffer 格式（File Format / Text Layout）

目标：**纯文本、可编辑、可解析、可生成 DocumentLink**。

### 6.1 文件头（可选）

- `# ASR v1`（用于版本识别与未来升级）

### 6.2 Results set 格式（v1）

```text
## [2026-02-02 21:15:03] pattern="<PATTERN>" mode=regex case=sensitive word=false
## root="workspaceFolderName" includes="**/*.{c,h}" excludes="**/vendor/**"
## totalFiles=123 totalMatches=456 truncated=false
--
<relative/path>:<line>:<col>: <preview text>
<relative/path>:<line>:<col>: <preview text>
...
--
```

要点：

- `##` 行是 heading，既可读又可解析。
- `--` 用作 set 的 body 分隔符（开始与结束）。
- match 行固定 `path:line:col: preview`，类似 grep，便于解析与生成链接。
- preview 建议截断（默认 240 chars），超出加 `…`。
- col 若缺失：允许 `path:line:: preview`（保持四段结构便于解析），解析器需容错。

### 6.3 可选增强（不强依赖）

- preview 内用 `<< >>` 标注命中范围（用户编辑可能破坏，不要依赖）。

---

## 7. 高层架构（High-level Architecture）

建议模块拆分（TypeScript）：

1. **BufferManager**
	- 创建/打开/定位目标 buffer（active / pinned）。
	- 提供 `appendSet(text)` / `replaceAll(text)` / `clear()`。
	- 使用 `WorkspaceEdit` 一次性插入/替换，避免逐条 edit。

2. **SearchEngine**
	- 调用 `vscode.workspace.findTextInFiles` 执行搜索。
	- 聚合 match，支持 cancel token。
	- 负责上限策略：`maxResults` / `maxMatchesPerFile` / `maxFileSizeKB`。

3. **Formatter**
	- 把结果结构化数据转换成 set 文本（heading + match lines）。
	- 负责相对路径、preview 截断、控制字符转义。

4. **LinkProvider**（DocumentLinkProvider）
	- 针对 `.asr` 文档，解析 match 行并生成 `DocumentLink`。
	- 点击后打开文件并定位到 `line/col`。

5. **Navigation**
	- Next/Prev match：扫描文档，找下一条可解析 match 行。

6. **State**
	- 保存 pinned buffer URI、最近一次搜索选项等（`workspaceState/globalState`）。

---

## 8. 关键实现细节（Implementation Notes）

### 8.1 搜索 API

使用：

- `vscode.workspace.findTextInFiles(query, options, callback, token)`

其中 query 支持：

- string 或 `{ pattern, isRegExp, isCaseSensitive, isWordMatch }`

必须：

- 通过 `CancellationTokenSource` 支持取消
- callback 中只收集数据，不要在 callback 内频繁写文档

### 8.2 写入性能

禁止每条 match 都 `editor.edit`。

推荐策略：

- 先聚合为一个大字符串 `setText`
- Append：
	- 取插入位置：`document.lineAt(document.lineCount - 1).range.end`
	- `WorkspaceEdit.insert(uri, pos, setText)`
- Replace：
	- `WorkspaceEdit.replace(uri, fullRange, setText)`

若结果巨大：

- 分批 append（例如 2000 条一批），每批一次 edit，并在批之间 `await` 让 UI 有喘气。

### 8.3 链接解析（Windows + multi-root 是雷区）

Windows 会出现：

- `C:\foo\bar.c:12:3: ...`

不能简单按第一个 `:` 切。

推荐解析法（鲁棒）：

- 从行尾用 regex 抓 `:(\d+):(\d+):` 或 `:(\d+)::` 定位 line/col
- 把前缀剩余部分当 path（去掉末尾多余 `:`）
- multi-root：
	- 在 heading 记录 `root="folderName"`，match 行只存相对路径
	- 解析时先确定当前 results set 的 root，再 resolve 到绝对 URI

### 8.4 编辑容错

用户可能删除 heading 或把 match 行改乱：

- 解析失败：该行不生成 link
- 插件不崩溃、不抛到主线程

### 8.5 语法高亮（可选）

最低配不做也可用。

增强方式：

- 注册 TextMate grammar：
	- `##` heading 高亮
	- match 行 `path:line:col:` 前缀高亮
	- `TRUNCATED` 强调

---

## 9. 配置项（Configuration）

在 `contributes.configuration` 中暴露：

- `robinSearch.defaultWriteMode`: `"append" | "replace" | "newBuffer"`
- `robinSearch.maxResults`: number（默认 20000）
- `robinSearch.maxMatchesPerFile`: number（默认 2000）
- `robinSearch.maxFileSizeKB`: number（默认 2048）
- `robinSearch.previewMaxChars`: number（默认 240）
- `robinSearch.respectSearchExclude`: boolean（默认 true）
- `robinSearch.bufferLocation`: `"workspace" | "ask"`（默认 workspace）
- `robinSearch.bufferDir`: string（默认 `.vscode/robin-search`）

---

## 10. 验收标准（Acceptance Criteria）

1. 能创建/打开 `.asr` buffer，且可编辑保存。
2. `Search (Append)` 会把结果作为新 results set 追加到末尾。
3. 每条 match 行可点击跳转到正确文件与行（col 有则定位到 col）。
4. Replace/New buffer 行为符合预期。
5. 大 repo 不长时间卡死：能 cancel；达到 `maxResults` 会截断并提示。
6. buffer 被用户编辑破坏格式后，插件不崩溃；解析失败的行只是不可跳转。

---

## 11. 测试计划（Testing）

### 11.1 单元测试（Node）

- `Formatter`：heading 字段、截断逻辑、转义正确
- `LinkParser`：
	- Unix path
	- Windows drive letter path
	- 无 col（`line::`）
	- 用户乱改格式（容错）

### 11.2 集成测试（VS Code Extension Test Runner）

- 创建临时 workspace + 若干文件
- 运行 append search，验证 `.asr` 内容被追加
- 验证 DocumentLink 能打开文件并定位（可通过命令调用模拟）

---

## 12. 里程碑（Milestones）

### MVP

- buffer 创建/打开（workspace 文件）
- append/replace/newBuffer
- `findTextInFiles` 搜索
- 纯文本结果 + DocumentLink 跳转
- `maxResults` + cancel

### v2（体验升级）

- pinned buffer
- next/prev match
- multi-root root 绑定更准确
- 语法高亮

### v3（更像专业工具）

- results set folding（FoldingRangeProvider）
- 导出 JSON / 复制为 grep 命令
- 可选去重策略（同一行重复 match 合并）

---

## 13. 给实现者（Codex）的硬性提示

- 不要依赖 VS Code 内部 Search Editor 的实现（稳定性差、易随版本变化）。
- 把 `.asr` 当普通文本文件来写，所有“智能”通过 Provider（DocumentLink/Folding/Grammar）附加。
- 解析必须对 Windows 的 `C:` 做特殊处理；建议“从末尾抓数字”解析 line/col。
