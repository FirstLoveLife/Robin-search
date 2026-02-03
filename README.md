# Robin Search

Source Insight-style **appendable search results**, built for VS Code.

If you like the Source Insight workflow where you keep appending multiple search runs into a single “evidence pool” and then jump through matches quickly, Robin Search brings that experience to the VS Code Side Bar.

Robin Search is a VS Code extension that provides a **self-contained** search workflow in the Side Bar:

- **Appendable results**: every search is kept as a new run (nothing is overwritten until you clear)
- **Fast jump + keyboard navigation**: open matches, go back, and jump next/previous result
- **Self-contained**: results are stored in extension storage (no external files required)
- **Two open modes**: keep the Side Bar open, or hide it after jumping to the editor

## Usage

1. Open Activity Bar → `Robin Search`
2. In `Search`, enter a pattern and press `Enter` (or click `Run Search`)
3. Expand `Results` and click a match to jump to the file at `line/col`
4. Run more searches — each one becomes a new run in `Results` (append-style history)

### Two open modes (default: keep Side Bar)

- Default (keep Side Bar): left-click a match in `Results`
  - command: `Robin Search: Open Match (Keep Side Bar)` (command id: `robinSearch.openMatchFromResults`)
- Hide Side Bar: right-click a match in `Results` → `Open Match (Hide Side Bar)`
  - command: `Robin Search: Open Match (Hide Side Bar)` (command id: `robinSearch.openMatchHideSidebar`)

> Note: keybindings are configurable in VS Code via the `Keyboard Shortcuts` UI.

## Default keybindings

You can change these defaults in VS Code `Keyboard Shortcuts`.

- Open Robin Search: `Ctrl+Alt+Shift+F` (macOS: `Cmd+Alt+Shift+F`)
- Back to Results: `Ctrl+Alt+Shift+R` (macOS: `Cmd+Alt+Shift+R`)
- Next Result: `Ctrl+Alt+Shift+Down` (macOS: `Cmd+Alt+Shift+Down`)
- Previous Result: `Ctrl+Alt+Shift+Up` (macOS: `Cmd+Alt+Shift+Up`)

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
- `robinSearch.showExcludeInput`: show the Excludes input in the Side Bar UI
- `robinSearch.showIncludesInput`: show the Includes input in the Side Bar UI
- `robinSearch.showScopeInfo`: show workspace root information in the Side Bar UI
- `robinSearch.showResultsScopeGroups`: group results by scope in the Results tree
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
