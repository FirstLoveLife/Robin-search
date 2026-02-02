# Robin Search

Robin Search is a VS Code extension that provides a **self-contained** search workflow in the Side Bar:

- Run search from the `Robin Search` view
- Results are stored inside the extension (no need to create/open files)
- Browse runs in the `Results` view and click a match to open the file

## Usage

1. Open Activity Bar → `Robin Search`
2. In `Search`, enter a pattern and press `Enter` (or click `Run Search`)
3. Expand `Results` and click a match to jump to source

## Commands

- `Robin Search: Run Search`
- `Robin Search: Clear Results`
- `Robin Search: Copy Query` (context menu on a run)
- `Robin Search: Delete Search Run` (context menu on a run)

## Notes

- Results are persisted in VS Code extension storage (per-workspace).
