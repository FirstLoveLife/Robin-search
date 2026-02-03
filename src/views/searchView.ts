import * as vscode from 'vscode';
import { getRobinSearchConfig } from '../services/config';
import { ResultsStore } from '../services/resultsStore';
import { SearchRunService } from '../services/searchRunService';
import { SearchUiState, SearchFormState } from '../services/searchUiState';

type FromWebviewMessage =
	| { type: 'ready' }
	| { type: 'runSearch'; payload: any }
	| { type: 'cancelSearch' }
	| { type: 'clearResults' }
	| { type: 'openSettings' };

type ToWebviewMessage =
	| { type: 'init'; payload: any }
	| { type: 'focusPattern' }
	| { type: 'progress'; payload: { matchesFound: number; filesSeen: number; elapsedMs: number } }
	| { type: 'done'; payload: any }
	| { type: 'error'; payload: { message: string } }
	;

function safeString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

export class SearchWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private activeSearch: vscode.CancellationTokenSource | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly searchRunner: SearchRunService,
		private readonly results: ResultsStore,
		private readonly uiState: SearchUiState,
		private readonly onDidMutate?: () => void,
	) {
	}

	public dispose(): void {
		this.cancelActiveSearch();
		for (const d of this.disposables) {
			d.dispose();
		}
	}

	public async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
		this.view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.context.extensionUri],
		};
		webviewView.webview.html = this.getHtml(webviewView.webview);

		this.disposables.push(
			webviewView.onDidChangeVisibility(() => {
				if (webviewView.visible) {
					void this.postMessage({ type: 'focusPattern' });
				}
			}),
		);

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
				this.cancelActiveSearch();
			}
		});

		webviewView.webview.onDidReceiveMessage((msg) => {
			void this.onMessage(msg as FromWebviewMessage);
		});

		await this.postInit();
		await this.postMessage({ type: 'focusPattern' });
	}

	public refresh(): void {
		void this.postInit();
	}

	private async onMessage(message: FromWebviewMessage): Promise<void> {
		switch (message.type) {
			case 'ready':
				await this.postInit();
				return;
			case 'cancelSearch':
				this.cancelActiveSearch();
				return;
			case 'clearResults': {
				await this.results.clear();
				await this.postInit();
				this.onDidMutate?.();
				return;
			}
			case 'openSettings': {
				await vscode.commands.executeCommand('workbench.action.openSettings', 'robinSearch');
				return;
			}
			case 'runSearch': {
				await this.handleRunSearch(message.payload);
				return;
			}
		}
	}

	private cancelActiveSearch(): void {
		if (!this.activeSearch) {
			return;
		}
		try {
			this.activeSearch.cancel();
		} finally {
			this.activeSearch.dispose();
			this.activeSearch = undefined;
		}
	}

	private async handleRunSearch(payload: any): Promise<void> {
		this.cancelActiveSearch();
		const cts = new vscode.CancellationTokenSource();
		this.activeSearch = cts;

		const config = getRobinSearchConfig();

		const form: Partial<SearchFormState> = {
			pattern: safeString(payload?.pattern),
			isRegExp: safeBool(payload?.isRegExp),
			isCaseSensitive: safeBool(payload?.isCaseSensitive),
			isWordMatch: safeBool(payload?.isWordMatch),
			// UI defaults to workspace root; still accept explicit rootName/rootId for compatibility.
			rootName: safeString(payload?.rootName, safeString(payload?.rootId, '')),
			includes: safeString(payload?.includes, '**/*'),
			excludes: config.showExcludeInput ? safeString(payload?.excludes, '') : '',
			respectExcludes: safeBool(payload?.respectExcludes, config.respectSearchExclude),
			maxResults: typeof payload?.maxResults === 'number' ? payload.maxResults : undefined,
		};

		if (!form.pattern) {
			await this.postMessage({ type: 'error', payload: { message: 'pattern is empty' } });
			return;
		}

		await this.uiState.setLastFormState(form);

		const startedAtMs = Date.now();
		await this.postMessage({ type: 'progress', payload: { matchesFound: 0, filesSeen: 0, elapsedMs: 0 } });

		try {
			const result = await this.searchRunner.run(
				{
					pattern: form.pattern,
					isRegExp: !!form.isRegExp,
					isCaseSensitive: !!form.isCaseSensitive,
					isWordMatch: !!form.isWordMatch,
					rootName: form.rootName || undefined,
					includes: form.includes || '**/*',
					excludes: form.excludes || '',
					respectExcludes: !!form.respectExcludes,
					maxResults: form.maxResults,
				},
				cts.token,
				(progress) => {
					void this.postMessage({ type: 'progress', payload: progress });
				},
			);

			const donePayload = {
				totalMatches: result.totalMatches,
				totalFiles: result.totalFiles,
				elapsedMs: result.elapsedMs,
				truncated: result.truncated,
				cancelled: result.cancelled,
				runId: result.runId,
			};

			await this.results.add(result);
			await this.postMessage({ type: 'done', payload: donePayload });
		} catch (err) {
			const cancelled = cts.token.isCancellationRequested;
			const msg = cancelled ? `Cancelled after ${Date.now() - startedAtMs}ms` : err instanceof Error ? err.message : String(err);
			await this.postMessage({ type: 'error', payload: { message: msg } });
		} finally {
			if (this.activeSearch === cts) {
				cts.dispose();
				this.activeSearch = undefined;
			}
			await this.postInit();
			this.onDidMutate?.();
		}
	}

	private async postInit(): Promise<void> {
		const config = getRobinSearchConfig();
		const last = this.uiState.getLastFormState();
		const resultsCount = this.results.list().length;

		const folders = vscode.workspace.workspaceFolders ?? [];
		let rootLabel = '(no workspace)';
		let rootDetail = '';
		if (folders.length === 1) {
			rootLabel = folders[0].name;
			rootDetail = folders[0].uri.fsPath;
		} else if (folders.length > 1) {
			rootLabel = `Workspace (${folders.length} folders)`;
			rootDetail = folders.map((f) => f.name).join(', ');
		}

		const payload = {
			workspace: { rootLabel, rootDetail },
			ui: { showExcludeInput: config.showExcludeInput },
			resultsCount,
			defaults: {
				includes: last.includes ?? '**/*',
				excludes: config.showExcludeInput ? (last.excludes ?? '') : '',
				respectExcludes: last.respectExcludes ?? config.respectSearchExclude,
				isRegExp: last.isRegExp ?? false,
				isCaseSensitive: last.isCaseSensitive ?? false,
				isWordMatch: last.isWordMatch ?? false,
				pattern: last.pattern ?? '',
				// UI always searches the workspace root, so we no longer expose rootName in the form.
				rootName: '',
				maxResults: last.maxResults ?? config.maxResults,
			},
		};

		await this.postMessage({ type: 'init', payload });
	}

	private async postMessage(message: ToWebviewMessage): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			await this.view.webview.postMessage(message);
		} catch {
			// ignore (webview can be disposed mid-flight)
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const nonce = String(Math.random()).slice(2);
		const csp = [
			"default-src 'none'",
			`img-src ${webview.cspSource} https: data:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');

		return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Robin Search</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 12px 12px 16px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-sideBar-foreground);
      background: var(--vscode-sideBar-background);
    }
    .section {
      margin: 0 0 12px;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
    }
    .section:last-of-type { margin-bottom: 0; }
    .h { margin: 0 0 10px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--vscode-sideBarSectionHeader-foreground); }
    .field { margin: 8px 0; }
    .label { display: block; margin: 0 0 6px; font-weight: 600; color: var(--vscode-foreground); }
    .hint { margin-top: 4px; font-size: 11px; color: var(--vscode-descriptionForeground); }
    .readonly {
      width: 100%;
      padding: 6px 8px;
      border-radius: 6px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      user-select: text;
    }

    input[type="text"], input[type="number"], select {
      width: 100%;
      border-radius: 4px;
      padding: 6px 8px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font: inherit;
    }
    input::placeholder { color: var(--vscode-input-placeholderForeground); }
    input:focus, select:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 0;
    }

    .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .row > * { flex: 1; min-width: 120px; }

    .checkRow { display: flex; gap: 12px; flex-wrap: wrap; }
    .check { display: inline-flex; gap: 6px; align-items: center; color: var(--vscode-foreground); }
    .check input { margin: 0; }

    .segmented { display: inline-flex; border: 1px solid var(--vscode-input-border, transparent); border-radius: 6px; overflow: hidden; }
    .segmented label { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer; user-select: none; color: var(--vscode-foreground); }
    .segmented input { position: absolute; opacity: 0; pointer-events: none; }
    .segmented label + label { border-left: 1px solid var(--vscode-input-border, transparent); }
    .segmented input:checked + span { font-weight: 700; }
    .segmented label:has(input:checked) { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .segmented label:focus-within { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }

    button {
      border-radius: 4px;
      padding: 6px 10px;
      border: 1px solid transparent;
      font: inherit;
      cursor: pointer;
    }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
    button.ghost { background: transparent; color: var(--vscode-foreground); border-color: var(--vscode-button-border, transparent); }
    button.ghost:hover { background: var(--vscode-toolbar-hoverBackground); }
    button:disabled { opacity: 0.6; cursor: default; }

    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .actions .spacer { flex: 999; }

    .status {
      margin-top: 12px;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      font-size: 12px;
    }
    .statusRow { display: grid; grid-template-columns: 64px 1fr; gap: 8px; margin: 2px 0; }
    .statusLabel { color: var(--vscode-descriptionForeground); }
    .statusValue { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    details { margin-top: 10px; }
    summary {
      cursor: pointer;
      color: var(--vscode-foreground);
      font-weight: 600;
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▸'; display: inline-block; width: 1em; }
    details[open] summary::before { content: '▾'; }
  </style>
</head>
<body>
  <div class="section">
    <div class="h">Query</div>
    <div class="field">
      <label class="label" for="pattern">Query</label>
      <input id="pattern" type="text" placeholder="Type a pattern…" spellcheck="false" autocomplete="off" />
      <div class="hint">Press <strong>Enter</strong> to run.</div>
    </div>

    <div class="field">
      <div class="label">Mode</div>
      <div class="row">
        <div class="segmented" role="radiogroup" aria-label="Search mode">
          <label>
            <input type="radio" name="mode" value="literal" checked />
            <span>literal</span>
          </label>
          <label>
            <input type="radio" name="mode" value="regex" />
            <span>regex</span>
          </label>
        </div>
      </div>
    </div>

    <div class="field">
      <div class="checkRow">
        <label class="check"><input id="caseSensitive" type="checkbox" /> <span>case sensitive</span></label>
        <label class="check"><input id="wholeWord" type="checkbox" /> <span>whole word</span></label>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="h">Scope</div>
    <div class="field">
      <div class="label">Root</div>
      <div id="rootLabel" class="readonly"></div>
      <div id="rootDetail" class="hint"></div>
    </div>
    <div class="field">
      <label class="check"><input id="respectExcludes" type="checkbox" /> <span>respect exclude settings</span></label>
    </div>
    <div class="field">
      <label class="label" for="includes">Includes</label>
      <input id="includes" type="text" placeholder="**/*" spellcheck="false" autocomplete="off" />
    </div>
    <div class="field" id="excludesField">
      <label class="label" for="excludes">Excludes</label>
      <input id="excludes" type="text" placeholder="(optional)" spellcheck="false" autocomplete="off" />
    </div>
    <details id="advanced">
      <summary>Advanced</summary>
      <div class="field">
        <label class="label" for="maxResults">Max results</label>
        <input id="maxResults" type="number" min="1" placeholder="20000" />
        <div class="hint">Stops after collecting this many matches.</div>
      </div>
    </details>
  </div>

  <div class="section">
    <div class="actions">
      <button id="runBtn" class="primary" type="button">Run Search</button>
      <button id="cancelBtn" class="secondary" type="button">Cancel</button>
      <button id="clearBtn" class="ghost" type="button">Clear Results</button>
      <span class="spacer"></span>
    </div>
    <div class="actions" style="margin-top: 6px;">
      <button id="settingsBtn" class="ghost" type="button">Settings</button>
    </div>
  </div>

  <div class="status" role="status" aria-live="polite">
    <div class="statusRow"><div class="statusLabel">Results</div><div id="resultsText" class="statusValue">-</div></div>
    <div class="statusRow"><div class="statusLabel">Status</div><div id="statusText" class="statusValue">idle</div></div>
    <div class="statusRow"><div class="statusLabel">Stats</div><div id="statsText" class="statusValue">-</div></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const el = (id) => document.getElementById(id);
    const q = (sel) => document.querySelector(sel);

    const state = {
      resultsCount: 0,
      showExcludeInput: false,
    };

    function setStatus(text) { el('statusText').textContent = text; }
    function setStats(text) { el('statsText').textContent = text; }
    function setResults(text) { el('resultsText').textContent = text; }

    const dirty = new Set();
    let isRunning = false;

    function setRunning(next) {
      isRunning = !!next;
      const hasPattern = !!(el('pattern').value || '').trim();
      el('runBtn').disabled = isRunning || !hasPattern;
      el('cancelBtn').disabled = !isRunning;
    }

    function focusPattern(selectAll) {
      const input = el('pattern');
      if (!input) return;
      input.focus();
      if (selectAll) input.select();
    }

    function scheduleFocus(selectAll) {
      // Focusing a WebviewView can be timing-sensitive; retry a few times.
      setTimeout(() => focusPattern(selectAll), 0);
      setTimeout(() => focusPattern(selectAll), 50);
      setTimeout(() => focusPattern(selectAll), 200);
    }

    function readMode() {
      const checked = q('input[name="mode"]:checked');
      return checked ? checked.value : 'literal';
    }

    function collectPayload() {
      const mode = readMode();
      const isRegExp = mode === 'regex';
      const maxResultsRaw = el('maxResults').value;
      const maxResults = maxResultsRaw ? Number(maxResultsRaw) : undefined;

      return {
        pattern: el('pattern').value || '',
        isRegExp,
        isCaseSensitive: el('caseSensitive').checked,
        isWordMatch: el('wholeWord').checked,
        includes: el('includes').value || '**/*',
        excludes: state.showExcludeInput ? (el('excludes').value || '') : '',
        respectExcludes: el('respectExcludes').checked,
        maxResults: Number.isFinite(maxResults) && maxResults > 0 ? maxResults : undefined,
      };
    }

    function setExcludeVisibility(show) {
      state.showExcludeInput = !!show;
      const field = el('excludesField');
      if (field) {
        field.style.display = state.showExcludeInput ? '' : 'none';
      }
      if (!state.showExcludeInput) {
        // If Excludes is hidden, do not keep applying stale values.
        el('excludes').value = '';
        dirty.delete('excludes');
      }
    }

    function applyInit(payload) {
      state.resultsCount = payload.resultsCount || 0;
      setResults(String(state.resultsCount) + ' runs');

      const ws = payload.workspace || {};
      el('rootLabel').textContent = ws.rootLabel || '(workspace)';
      el('rootDetail').textContent = ws.rootDetail || '';
      setExcludeVisibility(!!(payload.ui && payload.ui.showExcludeInput));

      const d = payload.defaults || {};
      if (!dirty.has('pattern')) el('pattern').value = d.pattern || '';
      if (!dirty.has('mode')) {
        const literal = q('input[name="mode"][value="literal"]');
        const regex = q('input[name="mode"][value="regex"]');
        if (d.isRegExp) regex.checked = true;
        else literal.checked = true;
      }
      if (!dirty.has('caseSensitive')) el('caseSensitive').checked = !!d.isCaseSensitive;
      if (!dirty.has('wholeWord')) el('wholeWord').checked = !!d.isWordMatch;
      if (!dirty.has('includes')) el('includes').value = d.includes || '**/*';
      if (state.showExcludeInput && !dirty.has('excludes')) el('excludes').value = d.excludes || '';
      if (!dirty.has('respectExcludes')) el('respectExcludes').checked = !!d.respectExcludes;
      if (!dirty.has('maxResults')) el('maxResults').value = d.maxResults ? String(d.maxResults) : '';
      setRunning(false);
    }

    // Mark fields dirty so refresh/init won't clobber user input mid-edit.
    for (const id of ['pattern', 'includes', 'excludes', 'maxResults']) {
      el(id).addEventListener('input', () => {
        dirty.add(id);
        setRunning(isRunning);
      });
    }
    for (const id of ['caseSensitive', 'wholeWord', 'respectExcludes']) {
      el(id).addEventListener('change', () => dirty.add(id));
    }
    for (const n of document.querySelectorAll('input[name="mode"]')) {
      n.addEventListener('change', () => dirty.add('mode'));
    }

    el('pattern').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        el('runBtn').click();
      }
    });

    el('runBtn').addEventListener('click', () => {
      if (el('runBtn').disabled) return;
      setStatus('running...');
      setStats('-');
      setRunning(true);
      vscode.postMessage({ type: 'runSearch', payload: collectPayload() });
    });
    el('cancelBtn').addEventListener('click', () => {
      setStatus('cancelling...');
      vscode.postMessage({ type: 'cancelSearch' });
    });
    el('clearBtn').addEventListener('click', () => {
      if (!confirm('Clear all results?')) return;
      vscode.postMessage({ type: 'clearResults' });
    });
    el('settingsBtn').addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'focusPattern') {
        scheduleFocus(true);
        return;
      }
      if (msg.type === 'init') {
        applyInit(msg.payload);
        setStatus('idle');
        setStats('-');
        return;
      }
      if (msg.type === 'progress') {
        const p = msg.payload;
        setStatus('running...');
        setStats('files=' + p.filesSeen + ' matches=' + p.matchesFound + ' elapsed=' + p.elapsedMs + 'ms');
        setRunning(true);
        return;
      }
      if (msg.type === 'done') {
        const p = msg.payload;
        setStatus('done');
        setStats('files=' + p.totalFiles + ' matches=' + p.totalMatches + ' elapsed=' + p.elapsedMs + 'ms truncated=' + p.truncated + ' cancelled=' + p.cancelled);
        setRunning(false);
        return;
      }
      if (msg.type === 'error') {
        setStatus('error');
        setStats(msg.payload.message);
        setRunning(false);
        return;
      }
    });

    setRunning(false);
    scheduleFocus(false);
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
	}
}
