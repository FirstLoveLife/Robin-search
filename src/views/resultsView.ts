import * as vscode from 'vscode';
import { ResultsStore, SearchMatch, SearchRun, SearchRunSet } from '../services/resultsStore';

export type ResultsTreeElement = RunTreeItem | SetTreeItem | MatchTreeItem;

function formatTime(timestampMs: number): string {
	const d = new Date(timestampMs);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatMode(run: SearchRun): string {
	return run.query.isRegExp ? 'regex' : 'literal';
}

function formatFlags(run: SearchRun): string {
	const flags: string[] = [];
	if (run.query.isCaseSensitive) {
		flags.push('case');
	}
	if (run.query.isWordMatch) {
		flags.push('word');
	}
	return flags.length ? flags.join(',') : '';
}

function resolveWorkspaceFolderByName(name: string): vscode.WorkspaceFolder | undefined {
	return (vscode.workspace.workspaceFolders ?? []).find((f) => f.name === name);
}

function resolveMatchUri(rootName: string, relativePath: string): vscode.Uri | undefined {
	const folder = resolveWorkspaceFolderByName(rootName);
	if (!folder) {
		return undefined;
	}
	const normalized = relativePath.replace(/\\/g, '/');
	return vscode.Uri.joinPath(folder.uri, normalized);
}

export class ResultsViewProvider implements vscode.TreeDataProvider<ResultsTreeElement>, vscode.Disposable {
	private readonly emitter = new vscode.EventEmitter<ResultsTreeElement | undefined>();
	public readonly onDidChangeTreeData = this.emitter.event;

	constructor(private readonly results: ResultsStore) {}

	public dispose(): void {
		this.emitter.dispose();
	}

	public refresh(): void {
		this.emitter.fire(undefined);
	}

	public getTreeItem(element: ResultsTreeElement): vscode.TreeItem {
		return element;
	}

	public getChildren(element?: ResultsTreeElement): vscode.ProviderResult<ResultsTreeElement[]> {
		if (!element) {
			return this.results.list().map((run) => new RunTreeItem(run));
		}
		if (element instanceof RunTreeItem) {
			return element.run.sets.map((s) => new SetTreeItem(element.run.runId, element.run, s));
		}
		if (element instanceof SetTreeItem) {
			return element.set.matches.map((m) => new MatchTreeItem(element.runId, element.run, element.set, m));
		}
		return [];
	}
}

export class RunTreeItem extends vscode.TreeItem {
	constructor(public readonly run: SearchRun) {
		const time = formatTime(run.timestampMs);
		const mode = formatMode(run);
		const flags = formatFlags(run);
		const flagSuffix = flags ? ` (${flags})` : '';
		const truncated = run.truncated ? ' TRUNCATED' : '';
		const cancelled = run.cancelled ? ' CANCELLED' : '';

		super(`[${time}] ${mode} "${run.query.pattern}"${flagSuffix}${truncated}${cancelled}`, vscode.TreeItemCollapsibleState.Collapsed);

		this.id = run.runId;
		this.contextValue = 'robinSearchRun';
		this.iconPath = new vscode.ThemeIcon('search');
		this.description = `${run.totalMatches} matches • ${run.totalFiles} files • ${run.elapsedMs}ms`;
		this.tooltip = new vscode.MarkdownString(
			`**pattern**: \`${run.query.pattern}\`\n\n` +
				`**mode**: \`${mode}\`${flags ? `\n\n**flags**: \`${flags}\`` : ''}\n\n` +
				`**scope**: \`${run.rootName || '(all folders)'}\`\n\n` +
				`**includes**: \`${run.includes}\`\n\n` +
				`**excludes**: \`${run.excludes || '(none)'}\`\n\n` +
				`**matches**: \`${run.totalMatches}\`\n\n` +
				`**files**: \`${run.totalFiles}\`\n\n` +
				`**elapsed**: \`${run.elapsedMs}ms\`\n\n` +
				`**truncated**: \`${run.truncated}\`\n\n` +
				`**cancelled**: \`${run.cancelled}\``,
		);
	}
}

export class SetTreeItem extends vscode.TreeItem {
	constructor(
		public readonly runId: string,
		public readonly run: SearchRun,
		public readonly set: SearchRunSet,
	) {
		const truncated = set.truncated ? ' TRUNCATED' : '';
		super(`${set.rootName}${truncated}`, vscode.TreeItemCollapsibleState.Collapsed);
		this.id = `${runId}::${set.rootName}`;
		this.contextValue = 'robinSearchRunSet';
		this.iconPath = new vscode.ThemeIcon('folder');
		this.description = `${set.totalMatches} matches • ${set.totalFiles} files`;
	}
}

export class MatchTreeItem extends vscode.TreeItem {
	constructor(
		public readonly runId: string,
		public readonly run: SearchRun,
		public readonly set: SearchRunSet,
		public readonly match: SearchMatch,
	) {
		const col = match.col ?? '';
		super(`${match.relativePath}:${match.line}:${col}`, vscode.TreeItemCollapsibleState.None);
		this.id = `${runId}::${set.rootName}::${match.relativePath}::${match.line}::${col}`;
		this.contextValue = 'robinSearchMatch';
		this.iconPath = new vscode.ThemeIcon('file');
		this.description = match.preview;

		const targetUri = resolveMatchUri(set.rootName, match.relativePath);
		if (targetUri) {
			this.command = {
				command: 'robinSearch.previewMatch',
				title: 'Preview Match',
				arguments: [{ targetUri: targetUri.toString(), line: match.line, col: match.col, runId }],
			};
		}
	}
}
