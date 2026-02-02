# Robin Search

Robin Search 是一个 VS Code extension，用于在 Side Bar 里提供 **self-contained** 的 search workflow：

- 在 `Robin Search` view 内直接 run search
- results 存在 extension storage 里（不需要用户 create/open 外部文件）
- 在 `Results` view 里浏览 run / match，然后一键跳转到 editor

## Usage

1. 打开 Activity Bar → `Robin Search`
2. 在 `Search` view 里输入 pattern，按 `Enter`（或点 `Run Search`）
3. 展开 `Results`，点击某个 match 直接跳到对应文件位置（line/col）

### 两种打开方式（默认不覆盖 Side Bar）

- 默认行为（不覆盖 Side Bar）：在 `Results` 里左键点击 match
  - command：`Robin Search: Open Match (Keep Side Bar)`（内部 command id：`robinSearch.openMatchFromResults`）
- 覆盖/隐藏 Side Bar：在 `Results` 里对 match 右键 → `Open Match (Hide Side Bar)`
  - command：`Robin Search: Open Match (Hide Side Bar)`（内部 command id：`robinSearch.openMatchHideSidebar`）

> 说明：VS Code 的 keybinding 天然可配置，你可以在 `Keyboard Shortcuts` UI 里改成自己喜欢的组合。

## Default keybindings

（你可以在 VS Code 的 `Keyboard Shortcuts` 里修改这些默认值）

- Open Robin Search：`Ctrl+Alt+Shift+F`（macOS：`Cmd+Alt+Shift+F`）
- Back to Results：`Ctrl+Alt+Shift+R`（macOS：`Cmd+Alt+Shift+R`）
- Next Result：`Ctrl+Alt+Shift+Down`（macOS：`Cmd+Alt+Shift+Down`）
- Previous Result：`Ctrl+Alt+Shift+Up`（macOS：`Cmd+Alt+Shift+Up`）

`Next/Previous Result` 会基于最近一次 search run 的 match 列表进行导航（循环 wrap-around）。

## Commands

- `Robin Search: Open`
- `Robin Search: Run Search`
- `Robin Search: Clear Results`
- `Robin Search: Copy Query`（run 的 context menu）
- `Robin Search: Delete Search Run`（run 的 context menu）
- `Robin Search: Open Match (Keep Side Bar)`（默认点击 match）
- `Robin Search: Open Match (Hide Side Bar)`（match 的 context menu）
- `Robin Search: Back To Results`
- `Robin Search: Next Result`
- `Robin Search: Previous Result`

## Configuration

在 Settings 里搜 `robinSearch`：

- `robinSearch.maxResults`：单次 search 最多收集多少 matches
- `robinSearch.maxMatchesPerFile`：每个文件最多收集多少 matches
- `robinSearch.maxFileSizeKB`：超过大小的文件 best-effort 跳过
- `robinSearch.previewMaxChars`：`Results` 里 preview 文本的截断长度
- `robinSearch.respectSearchExclude`：是否尊重 `search.exclude` / `files.exclude`
- `robinSearch.sidebarFileMaxLines`：Side Bar file viewer 最大渲染行数（大文件会 fallback 到命中附近 window）

## Notes

- results 会持久化到 VS Code extension storage（per-workspace）。

## Compatibility

- 最小兼容 VS Code：`1.106.0`（`engines.vscode = ^1.106.0`）

## Development

- compile：`npm run compile`
- test（dev extension test）：`npm test`
- package VSIX：`npm run package:vsix`（产物：`robin-search.vsix`）
- test VSIX（installed smoke test）：`npm run test:vsix`
