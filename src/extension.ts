import * as vscode from 'vscode';
import { ResultsStore, SearchRun } from './services/resultsStore';
import { SearchEngine, SearchEngineProgress } from './services/searchEngine';
import { SearchRunService, RunSearchRequest } from './services/searchRunService';
import { SearchUiState } from './services/searchUiState';
import { ResultsViewProvider } from './views/resultsView';
import { SearchWebviewViewProvider } from './views/searchView';

export interface RobinSearchApi {
	results: ResultsStore;
	uiState: SearchUiState;
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

	const searchEngine = new SearchEngine();
	const searchRunner = new SearchRunService(searchEngine, output);

	const resultsView = new ResultsViewProvider(results);
	let searchView: SearchWebviewViewProvider;

	const refreshAllViews = () => {
		resultsView.refresh();
		searchView?.refresh();
	};

	searchView = new SearchWebviewViewProvider(context, searchRunner, results, uiState, refreshAllViews);
	context.subscriptions.push(searchView, resultsView);

	const resultsTreeView = vscode.window.createTreeView('robinSearch.results', { treeDataProvider: resultsView });
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider('robinSearch.search', searchView, {
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
		vscode.commands.registerCommand('robinSearch.openMatch', async (args: { targetUri: string; line: number; col?: number }) => {
			const uri = vscode.Uri.parse(args.targetUri);
			let doc: vscode.TextDocument;
			try {
				doc = await vscode.workspace.openTextDocument(uri);
			} catch (err) {
				vscode.window.showErrorMessage(`Robin Search: failed to open ${uri.fsPath}`);
				throw err;
			}

			const editor = await vscode.window.showTextDocument(doc, { preview: true });

			const line = Math.max(args.line - 1, 0);
			const col = Math.max((args.col ?? 1) - 1, 0);
			const pos = new vscode.Position(line, col);
			editor.selection = new vscode.Selection(pos, pos);
			editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
		}),
	);

	return { results, uiState };
}

export function deactivate() {}

