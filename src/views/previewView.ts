import * as vscode from 'vscode';
import { getRobinSearchConfig } from '../services/config';

type FromWebviewMessage =
	| { type: 'ready' }
	| { type: 'openInEditor' }
	| { type: 'backToResults' };

type ToWebviewMessage =
	| { type: 'init'; payload: { title: string; subtitle: string } }
	| {
			type: 'show';
			payload: {
				title: string;
				subtitle: string;
				rangeLabel: string;
				lines: Array<{ lineNo: number; text: string; isHit: boolean }>;
				targetUri: string;
				line: number;
				col?: number;
			};
	  }
	| { type: 'clear'; payload: { title: string; subtitle: string } };

function escapeHtml(text: string): string {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function relLabel(uri: vscode.Uri): string {
	return vscode.workspace.asRelativePath(uri, true);
}

export class PreviewWebviewViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	private view: vscode.WebviewView | undefined;
	private current: { targetUri: string; line: number; col?: number } | undefined;
	private readonly disposables: vscode.Disposable[] = [];

	constructor(private readonly context: vscode.ExtensionContext) {}

	public dispose(): void {
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

		webviewView.onDidDispose(() => {
			if (this.view === webviewView) {
				this.view = undefined;
			}
		});

		webviewView.webview.onDidReceiveMessage((msg) => {
			void this.onMessage(msg as FromWebviewMessage);
		});

		await this.postMessage({
			type: 'init',
			payload: { title: 'No file open', subtitle: 'Click a match in Results to open it here.' },
		});
	}

	public async showMatch(args: { targetUri: string; line: number; col?: number }): Promise<void> {
		this.current = args;

		const config = getRobinSearchConfig();
		const uri = vscode.Uri.parse(args.targetUri);
		const doc = await vscode.workspace.openTextDocument(uri);

		const hitLine0 = Math.max(args.line - 1, 0);
		const maxLines = Math.max(100, config.sidebarFileMaxLines);
		let start = 0;
		let end = Math.max(0, doc.lineCount - 1);
		let truncated = false;
		if (doc.lineCount > maxLines) {
			truncated = true;
			const half = Math.floor(maxLines / 2);
			start = Math.max(0, hitLine0 - half);
			start = Math.min(start, Math.max(0, doc.lineCount - maxLines));
			end = Math.min(doc.lineCount - 1, start + maxLines - 1);
		}

		const lines: Array<{ lineNo: number; text: string; isHit: boolean }> = [];
		for (let i = start; i <= end; i++) {
			const text = doc.lineAt(i).text;
			lines.push({
				lineNo: i + 1,
				text,
				isHit: i === hitLine0,
			});
		}

		await this.postMessage({
			type: 'show',
			payload: {
				title: relLabel(uri),
				subtitle: `line ${args.line}${args.col ? `, col ${args.col}` : ''}`,
				rangeLabel: truncated ? `Showing ${start + 1}-${end + 1} of ${doc.lineCount} lines` : `${doc.lineCount} lines`,
				lines,
				targetUri: args.targetUri,
				line: args.line,
				col: args.col,
			},
		});
	}

	private async onMessage(msg: FromWebviewMessage): Promise<void> {
		if (msg.type === 'ready') {
			if (this.current) {
				await this.showMatch(this.current);
			}
			return;
		}
		if (msg.type === 'backToResults') {
			await vscode.commands.executeCommand('robinSearch.backToResults');
			return;
		}
		if (msg.type === 'openInEditor') {
			if (!this.current) {
				return;
			}
			await vscode.commands.executeCommand('robinSearch.openMatch', { ...this.current, preserveFocus: false });
			return;
		}
	}

	private async postMessage(message: ToWebviewMessage): Promise<void> {
		if (!this.view) {
			return;
		}
		try {
			await this.view.webview.postMessage(message);
		} catch {
			// ignore
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
  <title>Robin Search File</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 10px 12px 14px;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-sideBar-foreground);
      background: var(--vscode-sideBar-background);
    }
    .title { font-weight: 700; margin: 0 0 4px; }
    .subtitle { margin: 0 0 10px; color: var(--vscode-descriptionForeground); font-size: 12px; }
    .range { margin: -6px 0 10px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }
    button {
      border-radius: 4px;
      padding: 6px 10px;
      border: 1px solid transparent;
      font: inherit;
      cursor: pointer;
    }
    button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button.ghost { background: transparent; color: var(--vscode-foreground); border-color: var(--vscode-button-border, transparent); }
    button.ghost:hover { background: var(--vscode-toolbar-hoverBackground); }
    pre {
      margin: 0;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid var(--vscode-editorWidget-border);
      background: var(--vscode-editorWidget-background);
      color: var(--vscode-editorWidget-foreground);
      overflow: auto;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.55;
      tab-size: 8;
    }
    .line { display: grid; grid-template-columns: 48px 1fr; gap: 10px; }
    .ln { color: var(--vscode-descriptionForeground); text-align: right; user-select: none; }
    .hit { background: rgba(255, 200, 0, 0.15); border-radius: 4px; padding: 0 4px; }
  </style>
</head>
<body>
  <div class="title" id="title"></div>
  <div class="subtitle" id="subtitle"></div>
  <div class="range" id="range"></div>
  <div class="actions">
    <button id="backBtn" class="ghost" type="button">Back to Results</button>
    <button id="openBtn" class="primary" type="button">Open in Editor</button>
  </div>
  <pre id="code"></pre>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const el = (id) => document.getElementById(id);

    function render(payload) {
      el('title').textContent = payload.title || '';
      el('subtitle').textContent = payload.subtitle || '';
      el('range').textContent = payload.rangeLabel || '';
      const out = [];
      for (const line of (payload.lines || [])) {
        const cls = line.isHit ? 'hit' : '';
        const text = line.text ?? '';
        const id = line.isHit ? 'hit-line' : '';
        out.push('<div class="line" id="' + id + '"><div class="ln">' + line.lineNo + '</div><div class="' + cls + '">' + escapeHtml(text) + '</div></div>');
      }
      el('code').innerHTML = out.join('');

      const hit = document.getElementById('hit-line');
      if (hit) {
        // Wait for layout before scrolling.
        requestAnimationFrame(() => hit.scrollIntoView({ block: 'center' }));
      }
    }

    function escapeHtml(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;');
    }

    el('backBtn').addEventListener('click', () => vscode.postMessage({ type: 'backToResults' }));
    el('openBtn').addEventListener('click', () => vscode.postMessage({ type: 'openInEditor' }));

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'init' || msg.type === 'show' || msg.type === 'clear') {
        render(msg.payload);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
	}
}
