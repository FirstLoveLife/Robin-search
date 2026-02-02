import * as vscode from 'vscode';
import { getRobinSearchConfig } from './config';
import { SearchEngine, SearchEngineProgress } from './searchEngine';
import { SearchRun, SearchRunSet, SearchQuery } from './resultsStore';

export interface RunSearchRequest {
	pattern: string;
	isRegExp: boolean;
	isCaseSensitive: boolean;
	isWordMatch: boolean;

	rootName?: string;
	includes: string;
	excludes: string;
	respectExcludes: boolean;
	maxResults?: number;
}

function genRunId(now: number): string {
	const rand = Math.random().toString(36).slice(2, 8);
	return `${now}-${rand}`;
}

export class SearchRunService {
	constructor(
		private readonly searchEngine: SearchEngine,
		private readonly output: vscode.OutputChannel,
	) {}

	public async run(request: RunSearchRequest, token: vscode.CancellationToken, onProgress?: (p: SearchEngineProgress) => void): Promise<SearchRun> {
		const startedAtMs = Date.now();
		const config = getRobinSearchConfig();

		const query: SearchQuery = {
			pattern: request.pattern,
			isRegExp: request.isRegExp,
			isCaseSensitive: request.isCaseSensitive,
			isWordMatch: request.isWordMatch,
		};

		const maxResults = request.maxResults ?? config.maxResults;

		this.output.appendLine(`[run] pattern="${request.pattern}" mode=${request.isRegExp ? 'regex' : 'literal'} root=${request.rootName ?? ''}`);

		let cancelled = false;
		let sets: SearchRunSet[] = [];
		let totalMatches = 0;
		let totalFiles = 0;
		let truncated = false;

		try {
			const result = await this.searchEngine.searchWorkspaceFolders(
				query,
				{
					includes: request.includes,
					excludes: request.excludes,
					maxResults,
					maxMatchesPerFile: config.maxMatchesPerFile,
					maxFileSizeKB: config.maxFileSizeKB,
					previewMaxChars: config.previewMaxChars,
					respectSearchExclude: request.respectExcludes,
					workspaceFolderName: request.rootName,
				},
				token,
				onProgress,
			);

			sets = result.sets.map((s) => ({
				rootName: s.rootName,
				totalFiles: s.totalFiles,
				totalMatches: s.totalMatches,
				truncated: s.truncated,
				matches: s.matches.map((m) => ({
					relativePath: m.relativePath,
					line: m.line,
					col: m.col,
					preview: m.preview,
				})),
			}));

			totalMatches = sets.reduce((sum, s) => sum + s.totalMatches, 0);
			totalFiles = sets.reduce((sum, s) => sum + s.totalFiles, 0);
			truncated = sets.some((s) => s.truncated);
		} catch (err) {
			cancelled = token.isCancellationRequested;
			throw err;
		} finally {
			cancelled = cancelled || token.isCancellationRequested;
		}

		const elapsedMs = Date.now() - startedAtMs;
		return {
			runId: genRunId(startedAtMs),
			timestampMs: startedAtMs,

			query,
			rootName: request.rootName ?? '',
			includes: request.includes,
			excludes: request.excludes,
			respectExcludes: request.respectExcludes,
			maxResults,

			totalMatches,
			totalFiles,
			elapsedMs,
			truncated,
			cancelled,

			sets,
		};
	}
}

