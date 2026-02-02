import * as vscode from 'vscode';
import { ResultsStore, SearchRun } from './services/resultsStore';
import { SearchEngine, SearchEngineProgress } from './services/searchEngine';
import { SearchRunService, RunSearchRequest } from './services/searchRunService';
import { getRobinSearchConfig } from './services/config';
import { SearchUiState } from './services/searchUiState';
import { NavigationState } from './services/navigationState';
import { ViewModeState } from './services/viewModeState';
import { ResultsViewProvider, RunTreeItem } from './views/resultsView';
import { PreviewWebviewViewProvider } from './views/previewView';
import { SearchWebviewViewProvider } from './views/searchView';

export interface RobinSearchApi {
	results: ResultsStore;
	uiState: SearchUiState;
	nav: NavigationState;
	mode: ViewModeState;
}

function normalizeRunIdFromArgs(args: unknown): string | undefined {
	if (!args) {
		return undefined;
	}
	if (typeof args === 'string') {
		return args;
	}
	if (typeof args === 'object' && args !== null) {
		const obj = args as { runId?: unknown; run?: unknown };
		if (typeof obj.runId === 'string') {
			return obj.runId;
		}
		if (typeof obj.run === 'object' && obj.run !== null && 'runId' in obj.run) {
			const run = obj.run as { runId?: unknown };
			if (typeof run.runId === 'string') {
				return run.runId;
			}
		}
	}
	return undefined;
}

function normalizeRunFromArgs(args: unknown): SearchRun | undefined {
	if (!args || typeof args !== 'object') {
		return undefined;
	}
	if ('run' in args) {
		const run = (args as { run?: unknown }).run;
		if (run && typeof run === 'object' && 'runId' in run) {
			return run as SearchRun;
		}
	}
	return undefined;
}

function normalizeSearchArgs(args: unknown): RunSearchRequest | undefined {
	if (!args || typeof args !== 'object') {
		return undefined;
	}
	const obj = args as Partial<RunSearchRequest> & { workspaceFolderName?: string };
	if (typeof obj.pattern !== 'string' || obj.pattern.trim() === '') {
		return undefined;
	}

	return {
		pattern: obj.pattern,
		isRegExp: !!obj.isRegExp,
		isCaseSensitive: !!obj.isCaseSensitive,
		isWordMatch: !!obj.isWordMatch,
		rootName: typeof obj.rootName === 'string' ? obj.rootName : typeof obj.workspaceFolderName === 'string' ? obj.workspaceFolderName : undefined,
		includes: typeof obj.includes === 'string' ? obj.includes : '**/*',
		excludes: typeof obj.excludes === 'string' ? obj.excludes : '',
		respectExcludes: typeof obj.respectExcludes === 'boolean' ? obj.respectExcludes : true,
		maxResults: typeof obj.maxResults === 'number' ? obj.maxResults : undefined,
	};
}

export async function activate(context: vscode.ExtensionContext): Promise<RobinSearchApi> {
	const output = vscode.window.createOutputChannel('Robin Search');
	context.subscriptions.push(output);

	const uiState = new SearchUiState(context.workspaceState);
	const results = new ResultsStore(context);
	await results.load();
	const nav = new NavigationState();
	const mode = new ViewModeState();
	// Default to Results mode so the `Results` view is visible and the file viewer is hidden.
	await mode.set('results');

	const searchEngine = new SearchEngine();
	const searchRunner = new SearchRunService(searchEngine, output);

	const resultsView = new ResultsViewProvider(results);
	const previewView = new PreviewWebviewViewProvider(context);
	let searchView: SearchWebviewViewProvider;

	const refreshAllViews = () => {
		resultsView.refresh();
		searchView?.refresh();
	};

	searchView = new SearchWebviewViewProvider(context, searchRunner, results, uiState, refreshAllViews);
	context.subscriptions.push(searchView, resultsView, previewView);

	const resultsTreeView = vscode.window.createTreeView('robinSearch.results', { treeDataProvider: resultsView });
	let lastSelectedRunId: string | undefined;
	context.subscriptions.push(
		resultsTreeView.onDidChangeSelection((e) => {
			const first = e.selection[0];
			if (first instanceof RunTreeItem) {
				lastSelectedRunId = first.run.runId;
			}
		}),
	);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('robinSearch.search', searchView, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.window.registerWebviewViewProvider('robinSearch.preview', previewView, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		resultsTreeView,
	);

	const runSearchAndStore = async (
		request: RunSearchRequest,
		token: vscode.CancellationToken,
		onProgress?: (p: SearchEngineProgress) => void,
	): Promise<SearchRun> => {
		const run = await searchRunner.run(request, token, onProgress);
		await results.add(run);
		refreshAllViews();
		return run;
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.runSearch', async (args?: unknown) => {
			const request = normalizeSearchArgs(args);
			if (!request) {
				const pattern = await vscode.window.showInputBox({ title: 'Robin Search', prompt: 'Search pattern (text or regex)' });
				if (!pattern) {
					return;
				}
				const fallback: RunSearchRequest = {
					pattern,
					isRegExp: false,
					isCaseSensitive: false,
					isWordMatch: false,
					includes: '**/*',
					excludes: '',
					respectExcludes: true,
				};
				await vscode.window.withProgress(
					{ location: vscode.ProgressLocation.Notification, title: 'Robin Search', cancellable: true },
					(_progress, token) => runSearchAndStore(fallback, token),
				);
				return;
			}

			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: 'Robin Search', cancellable: true },
				(progress, token) =>
					runSearchAndStore(request, token, (p) => {
						progress.report({ message: `files=${p.filesSeen} matches=${p.matchesFound}` });
					}),
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.clearResults', async () => {
			await results.clear();
			refreshAllViews();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.deleteRun', async (args?: unknown) => {
			const runId = normalizeRunIdFromArgs(args);
			if (!runId) {
				return;
			}
			await results.delete(runId);
			refreshAllViews();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.copyQuery', async (args?: unknown) => {
			const run = normalizeRunFromArgs(args);
			if (run) {
				await vscode.env.clipboard.writeText(run.query.pattern);
				return;
			}

			const runId = normalizeRunIdFromArgs(args);
			if (!runId) {
				return;
			}
			const found = results.get(runId);
			if (!found) {
				return;
			}
			await vscode.env.clipboard.writeText(found.query.pattern);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'robinSearch.openMatch',
			async (args: { targetUri: string; line: number; col?: number; preserveFocus?: boolean }) => {
			if (!args || typeof args.targetUri !== 'string' || typeof args.line !== 'number') {
				vscode.window.showInformationMessage('Robin Search: click a match in Results to open it.');
				return;
			}
			const uri = vscode.Uri.parse(args.targetUri);
			let doc: vscode.TextDocument;
			try {
				doc = await vscode.workspace.openTextDocument(uri);
			} catch (err) {
				vscode.window.showErrorMessage(`Robin Search: failed to open ${uri.fsPath}`);
				throw err;
			}

			const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: !!args.preserveFocus });

			const line = Math.max(args.line - 1, 0);
			const col = Math.max((args.col ?? 1) - 1, 0);
			const pos = new vscode.Position(line, col);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.openMatchFromResults', async (args: { targetUri: string; line: number; col?: number; runId?: string }) => {
			if (!args || typeof args.targetUri !== 'string' || typeof args.line !== 'number') {
				vscode.window.showInformationMessage('Robin Search: click a match in Results to open it.');
				return;
			}
			if (typeof args?.runId === 'string') {
				lastSelectedRunId = args.runId;
			}
			nav.setReturnTarget({ viewId: 'robinSearch.results', runId: lastSelectedRunId });
			// Ensure next time Robin Search is opened it starts in Results mode.
			await mode.set('results');

			await vscode.commands.executeCommand('robinSearch.openMatch', { targetUri: args.targetUri, line: args.line, col: args.col, preserveFocus: false });

			const config = getRobinSearchConfig();
			if (config.hideAfterOpenInEditor) {
				try {
					await vscode.commands.executeCommand('workbench.action.closeSidebar');
				} catch {
					// ignore
				}
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.previewMatch', async (args: { targetUri: string; line: number; col?: number; runId?: string }) => {
			if (!args || typeof args.targetUri !== 'string' || typeof args.line !== 'number') {
				vscode.window.showInformationMessage('Robin Search: click a match in Results to open it.');
				return;
			}
			if (typeof args?.runId === 'string') {
				lastSelectedRunId = args.runId;
			}
			nav.setReturnTarget({ viewId: 'robinSearch.results', runId: lastSelectedRunId });

			// Switch the Side Bar into "file" mode so the file viewer replaces the Results view.
			await mode.set('file');

			await previewView.showMatch({ targetUri: args.targetUri, line: args.line, col: args.col });

			// Best-effort focus Preview view.
			await vscode.commands.executeCommand('workbench.view.extension.robinSearch');
			for (const cmd of ['robinSearch.preview.focus', 'workbench.action.focusView']) {
				try {
					if (cmd === 'robinSearch.preview.focus') {
						await vscode.commands.executeCommand(cmd);
					} else {
						// Some VS Code builds support focusing views via a generic command.
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						await (vscode.commands.executeCommand as any)(cmd, 'robinSearch.preview');
					}
					break;
				} catch {
					// ignore
				}
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('robinSearch.backToResults', async () => {
			const target = nav.getReturnTarget();
			await mode.set('results');
			await vscode.commands.executeCommand('workbench.view.extension.robinSearch');
			if (target?.viewId === 'robinSearch.results') {
				const runId = target.runId;
				if (runId) {
					const run = results.get(runId);
					if (run) {
						try {
							await resultsTreeView.reveal(new RunTreeItem(run), { select: true, focus: true, expand: false });
							return;
						} catch {
							// ignore reveal failures
						}
					}
				}
				// best-effort focus Results by revealing first run, if any
				const first = results.list()[0];
				if (first) {
					try {
						await resultsTreeView.reveal(new RunTreeItem(first), { select: true, focus: true, expand: false });
					} catch {
						// ignore
					}
				}
			}
		}),
	);

	return { results, uiState, nav, mode };
}

export function deactivate() {}
