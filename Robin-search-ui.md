# Robin-search UI 设计（VS Code Side Bar 入口）

> 目标：VS Code 插件从 Side Bar 进入，用户在面板内输入 query 并选择 Append/Replace/New Buffer；结果写入可编辑 `.asr` buffer；面板提供 buffer 管理与 results set 历史索引，支持一键跳转与 cancel。

---

## 1. UI 总览与信息架构

Robin-search 在 Activity Bar（左侧竖栏）新增一个入口图标：`Robin Search`。

进入后建议包含 2～3 个 view：

1) `Search`（主控面板，**WebviewView**）  
2) `Buffers`（buffer 列表，**TreeView**）  
3) `History`（最近 results set 摘要，**TreeView**，可选但推荐）

设计原则：

- Side Bar 负责“控制 + 索引”，不负责渲染海量结果明细  
- 明细结果写入 `.asr`（Editor 里可编辑/可保存/可点击跳转）  
- UI 需要可靠的 `Cancel`、可复用的目标 buffer（Pin）、可快速回放历史搜索（History）

---

## 2. 入口与导航

### 2.1 Activity Bar 入口

- 新增 ViewContainer：`Robin Search`
- 图标：建议用简单的放大镜 + 羽毛（或仅放大镜），保持识别度

### 2.2 默认打开的 View

用户点击 `Robin Search`：

- 默认 focus `Search` view（WebviewView）
- `Buffers` view 在下方或同一容器内并列显示（按用户布局习惯）

---

## 3. Search 面板（WebviewView）设计

### 3.1 布局（ASCII mock）

```text
[ Robin Search ]

Query
  [______________________________]  (Enter to run)
  ( ) literal   ( ) regex
  [ ] case sensitive   [ ] whole word

Scope
  Root: [ workspace-folder ▼ ]
  Includes: [**/*.{c,h}]
  Excludes: [**/vendor/**]
  [ ] respect search.exclude / files.exclude

Target Buffer
  Buffer: [ pinned / active / pick... ▼ ]
  Write mode: [ Append ▼ ]   (Append | Replace | New Buffer)

Actions
  [ Run Search ]  [ Cancel ]  [ Open Buffer ]  [ Create Buffer ]
  Status: idle / running... / done
  Stats: files=??? matches=??? elapsed=???ms truncated/cancelled
```

### 3.2 交互细节（必须做到）

- `Enter` 触发 `Run Search`（使用当前 `Write mode`）
- `Write mode` 支持：
  - `Append`：追加为新 results set
  - `Replace`：清空 buffer 后写入
  - `New Buffer`：创建新 buffer 写入
- `Buffer` 下拉选项（逻辑优先级）：
  - `Pinned buffer`（若存在）
  - `Active .asr buffer`（当前 editor 正在查看 `.asr`）
  - `Pick buffer...`（弹出 QuickPick 选择已存在 buffer）
- `Cancel` 必须触发真实取消（`CancellationTokenSource.cancel()`）
- 搜索完成后，Status/Stats 必须给出：
  - `totalMatches`
  - `totalFiles`（能统计就统计）
  - `elapsedMs`
  - `truncated=true/false`
  - `cancelled=true/false`（若实现取消标记）

### 3.3 体验增强（建议）

- `mode`（literal/regex）在 UI 上显式，避免用户误解  
- includes/excludes 输入框支持常用值记忆（最近 5 条）  
- “Run Search”按钮旁增加一个小齿轮图标 → 打开 Settings（跳转到配置）

---

## 4. Buffers 列表（TreeView）设计

### 4.1 Tree 结构建议

```text
Buffers
  ★ pinned: kernel-investigation.asr
  recent/
    secfs.asr
    cxl.asr
    todo.asr
```

展示规则：

- pinned 独立在顶部，显式标星
- recent 展示最近打开/写入过的 buffer（最多 N 个，默认 10）

### 4.2 Buffers 的 Title Actions（view 标题栏按钮）

- `+ Create Buffer`
- `Open Existing Buffer`

### 4.3 Buffers Item Context Menu（右键菜单）

- `Open`
- `Pin` / `Unpin`
- `Set as Target`（把 Search view 的 Target Buffer 指向该 buffer）
- `Reveal in Explorer`
- `Rename`（可选：文件重命名）
- `Delete`（谨慎：建议 Move to Trash + confirm）

---

## 5. History（最近 results set 摘要）（TreeView，可选但推荐）

### 5.1 目的

- 在 Side Bar 里快速看到“我刚刚搜了什么、命中多少、是否截断/取消”
- 一键跳转到 `.asr` 对应 results set 的 heading 行

### 5.2 Tree 展示

```text
History
  [21:15:03] regex  "jbd2_journal_lock_updates"   32 hits
  [21:18:10] literal "FC_COMMITTING"            128 hits  TRUNCATED
```

### 5.3 点击行为

- 打开对应 `.asr` buffer
- `reveal` 到该 set 的 heading 行（`TextEditor.revealRange` + 设置 selection）

### 5.4 History Item Context Menu

- `Open buffer at set`
- `Copy query`
- `Re-run (Append)`
- `Re-run (Replace)`
- `Delete history entry`（只删索引，不改 buffer 内容）

### 5.5 数据模型（建议）

每次写入 results set 时生成：

- `setId: string`（timestamp + counter）
- `bufferUri: string`
- `rootName: string`（multi-root）
- `pattern / flags / includes / excludes`
- `totalMatches / truncated / cancelled`
- `headingLine: number`（可选，便于快速定位）

存储：

- `context.workspaceState`（按 workspace 维度）
- 只保留最近 N 条（默认 50）

---

## 6. UI 与后端的消息协议（WebviewView ↔ Extension Host）

### 6.1 Webview → Extension（runSearch payload）

```json
{
  "type": "runSearch",
  "payload": {
    "pattern": "string",
    "isRegExp": true,
    "isCaseSensitive": false,
    "isWordMatch": false,
    "rootId": "string",
    "includes": "**/*.{c,h}",
    "excludes": "**/vendor/**",
    "respectExcludes": true,
    "targetBuffer": { "mode": "pinned|active|pick", "uri": "optional" },
    "writeMode": "append|replace|newBuffer",
    "maxResults": 20000
  }
}
```

### 6.2 Webview → Extension（cancel）

```json
{ "type": "cancelSearch" }
```

### 6.3 Extension → Webview（progress）

```json
{
  "type": "progress",
  "payload": {
    "matchesFound": 1234,
    "filesSeen": 456,
    "elapsedMs": 7890
  }
}
```

### 6.4 Extension → Webview（done）

```json
{
  "type": "done",
  "payload": {
    "totalMatches": 456,
    "totalFiles": 123,
    "elapsedMs": 3210,
    "truncated": false,
    "cancelled": false,
    "bufferUri": "file://...",
    "setId": "..."
  }
}
```

### 6.5 Extension → Webview（error）

```json
{ "type": "error", "payload": { "message": "..." } }
```

---

## 7. 性能与 UX 约束（UI 必须遵守）

1) Side Bar 不渲染海量明细  
- 只显示摘要与索引；明细在 `.asr` 打开查看

2) `Cancel` 必须真实取消  
- UI button 必须对应 `CancellationTokenSource.cancel()`

3) 大量结果写入要批量化  
- UI 的 progress 必须能持续刷新（避免“假死”）

4) 错误要可诊断  
- UI 显示 error message（同时在 OutputChannel 记录详细日志）

---

## 8. 最小可用 UI（MVP 范围）

MVP 必须交付：

- Activity Bar 入口 + `Search` WebviewView
- `Buffers` TreeView（Create/Open/Pin/Open）
- Search view 支持：
  - 输入 query + flags（regex/case/word）
  - includes/excludes + root
  - target buffer + write mode（Append/Replace/New Buffer）
  - Run + Cancel + Status/Stats

History 可作为 v2：

- 先实现 setId + headingLine 记录
- 再补 TreeView 展示与跳转

---

## 9. 迭代增强（v2/v3）

v2：

- History TreeView
- Next/Prev match 导航按钮（Search view 或 editor command）
- 轻量语法高亮（TextMate grammar）

v3：

- results set folding（FoldingRangeProvider）
- Search view 的“最近 5 次搜索”快速按钮
- 多 buffer 并行（多 pinned 或快速切换 target）
