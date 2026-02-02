# Robin Search

Robin Search is a VS Code extension that provides a **self-contained** search workflow in the Side Bar:

- Run searches directly in the `Robin Search` views
- Store results in extension storage (no need to create/open external files)
- Browse runs/matches in the `Results` view and jump to the editor

## Usage

1. Open Activity Bar → `Robin Search`
2. In `Search`, enter a pattern and press `Enter` (or click `Run Search`)
3. Expand `Results` and click a match to jump to the file at `line/col`

### Two open modes (default: keep Side Bar)

- Default (keep Side Bar): left-click a match in `Results`
  - command: `Robin Search: Open Match (Keep Side Bar)` (command id: `robinSearch.openMatchFromResults`)
- Hide Side Bar: right-click a match in `Results` → `Open Match (Hide Side Bar)`
  - command: `Robin Search: Open Match (Hide Side Bar)` (command id: `robinSearch.openMatchHideSidebar`)

> Note: keybindings are configurable in VS Code via the `Keyboard Shortcuts` UI.

## Default keybindings

You can change these defaults in VS Code `Keyboard Shortcuts`.

- Open Robin Search：`Ctrl+Alt+Shift+F`（macOS：`Cmd+Alt+Shift+F`）
- Back to Results：`Ctrl+Alt+Shift+R`（macOS：`Cmd+Alt+Shift+R`）
- Next Result：`Ctrl+Alt+Shift+Down`（macOS：`Cmd+Alt+Shift+Down`）
- Previous Result：`Ctrl+Alt+Shift+Up`（macOS：`Cmd+Alt+Shift+Up`）

`Next/Previous Result` navigates matches from the most recent search run (wrap-around).

## Commands

- `Robin Search: Open`
- `Robin Search: Run Search`
- `Robin Search: Clear Results`
- `Robin Search: Copy Query` (run context menu)
- `Robin Search: Delete Search Run` (run context menu)
- `Robin Search: Open Match (Keep Side Bar)` (default match click)
- `Robin Search: Open Match (Hide Side Bar)` (match context menu)
- `Robin Search: Back To Results`
- `Robin Search: Next Result`
- `Robin Search: Previous Result`

## Configuration

Search `robinSearch` in Settings:

- `robinSearch.maxResults`: max matches collected per search
- `robinSearch.maxMatchesPerFile`: max matches collected per file
- `robinSearch.maxFileSizeKB`: skip files larger than this size (best-effort)
- `robinSearch.previewMaxChars`: max preview characters shown in `Results`
- `robinSearch.respectSearchExclude`: respect `search.exclude` / `files.exclude`
- `robinSearch.sidebarFileMaxLines`: max lines rendered by the Side Bar file viewer (large files fall back to a window around the hit)

## Notes

- Results are persisted in VS Code extension storage (per-workspace).

## Compatibility

- Minimum VS Code: `1.106.0` (`engines.vscode = ^1.106.0`)

## Development

- Compile: `npm run compile`
- Test (dev extension tests): `npm test`
- Package VSIX: `npm run package:vsix` (output: `robin-search.vsix`)
- Test VSIX (installed smoke test): `npm run test:vsix`
