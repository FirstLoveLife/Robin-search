import * as childProcess from 'child_process';
import * as readline from 'readline';
import * as vscode from 'vscode';
import { rgPath } from '@vscode/ripgrep';
import { AsrMatchLine, AsrResultsSet, AsrSearchQuery, sanitizePreview, truncatePreview } from './formatter';

export interface SearchEngineOptions {
	includes: string;
	excludes: string;
	maxResults: number;
	maxMatchesPerFile: number;
	maxFileSizeKB: number;
	previewMaxChars: number;
	respectSearchExclude: boolean;
	workspaceFolderName?: string;
}

export interface SearchEngineResult {
	sets: AsrResultsSet[];
}

export interface SearchEngineProgress {
	matchesFound: number;
	filesSeen: number;
	elapsedMs: number;
}

function pickWorkspaceFolders(name?: string): vscode.WorkspaceFolder[] {
	const folders = Array.from(vscode.workspace.workspaceFolders ?? []);
	if (!name) {
		return folders;
	}
	const found = folders.find((f) => f.name === name);
	return found ? [found] : folders;
}

function toRgGlobPatterns(input: string): string[] {
	const trimmed = input.trim();
	if (!trimmed) {
		return [];
	}
	return [trimmed];
}

function configExcludeGlobs(folder: vscode.WorkspaceFolder): string[] {
	const globs: string[] = [];

	const searchExclude = vscode.workspace.getConfiguration('search', folder.uri).get<Record<string, boolean>>('exclude', {});
	const filesExclude = vscode.workspace.getConfiguration('files', folder.uri).get<Record<string, boolean>>('exclude', {});
	for (const [k, v] of Object.entries({ ...searchExclude, ...filesExclude })) {
		if (v) {
			globs.push(k);
		}
	}
	return globs;
}

function byteOffsetToVscodeColumn(text: string, byteOffset: number): number {
	if (byteOffset <= 0) {
		return 1;
	}
	const buf = Buffer.from(text, 'utf8');
	const prefix = buf.subarray(0, Math.min(byteOffset, buf.length));
	// JS string length counts UTF-16 code units which matches VS Code Position.character.
	return prefix.toString('utf8').length + 1;
}

export class SearchEngine {
	public async searchWorkspaceFolders(
		query: AsrSearchQuery,
		options: SearchEngineOptions,
		token: vscode.CancellationToken,
		onProgress?: (progress: SearchEngineProgress) => void,
	): Promise<SearchEngineResult> {
		const timestamp = new Date();
		const startedAtMs = Date.now();
		const cts = new vscode.CancellationTokenSource();
		const subscription = token.onCancellationRequested(() => cts.cancel());
		const folders = pickWorkspaceFolders(options.workspaceFolderName);
		const sets: AsrResultsSet[] = [];
		let globalMatchCount = 0;
		let globallyTruncated = false;
		const globalMatchedFiles = new Set<string>();
		let lastProgressMs = 0;

		try {
			for (const folder of folders) {
				if (cts.token.isCancellationRequested) {
					break;
				}
				if (globalMatchCount >= options.maxResults) {
					globallyTruncated = true;
					cts.cancel();
					break;
				}

				const matchedFiles = new Set<string>();
				const matches: AsrMatchLine[] = [];
				let truncated = false;

				const rgArgs: string[] = ['--json', '--no-config', '--no-heading', '--color', 'never'];
				if (!query.isRegExp) {
					rgArgs.push('--fixed-strings');
				}
				if (!query.isCaseSensitive) {
					rgArgs.push('-i');
				}
				if (query.isWordMatch) {
					rgArgs.push('-w');
				}
				if (options.maxMatchesPerFile > 0) {
					rgArgs.push('--max-count', String(options.maxMatchesPerFile));
				}
				if (options.maxFileSizeKB > 0) {
					rgArgs.push('--max-filesize', `${options.maxFileSizeKB}K`);
				}
				if (!options.respectSearchExclude) {
					rgArgs.push('--no-ignore');
				}

				for (const globPattern of toRgGlobPatterns(options.includes)) {
					if (globPattern !== '**/*') {
						rgArgs.push('--glob', globPattern);
					}
				}

				const excludes = [
					...toRgGlobPatterns(options.excludes),
					...(options.respectSearchExclude ? configExcludeGlobs(folder) : []),
				];
				for (const globPattern of excludes) {
					const normalized = globPattern.trim();
					if (!normalized) {
						continue;
					}
					rgArgs.push('--glob', normalized.startsWith('!') ? normalized : `!${normalized}`);
				}

				rgArgs.push('--', query.pattern, '.');

				const proc = childProcess.spawn(rgPath, rgArgs, {
					cwd: folder.uri.fsPath,
					stdio: ['ignore', 'pipe', 'pipe'],
				});

				let stderr = '';
				proc.stderr?.setEncoding('utf8');
				proc.stderr?.on('data', (chunk: string) => {
					stderr += chunk;
				});

				const rl = readline.createInterface({ input: proc.stdout! });
				const cancelSubscription = cts.token.onCancellationRequested(() => {
					try {
						proc.kill();
					} catch {
						// ignore
					}
				});

				try {
					await new Promise<void>((resolve, reject) => {
						const killForLimit = () => {
							try {
								proc.kill();
							} catch {
								// ignore
							}
						};

						rl.on('line', (line) => {
							if (cts.token.isCancellationRequested) {
								return;
							}
							if (globalMatchCount >= options.maxResults) {
								truncated = true;
								globallyTruncated = true;
								killForLimit();
								return;
							}
							let obj: any;
							try {
								obj = JSON.parse(line);
							} catch {
								return;
							}
							if (obj?.type !== 'match') {
								return;
							}

							const data = obj.data;
							const relPath: string | undefined = data?.path?.text;
							const lineNumber: number | undefined = data?.line_number;
							const lineTextRaw: string | undefined = data?.lines?.text;
							const submatches: Array<{ start: number }> | undefined = data?.submatches;
							if (!relPath || !lineNumber || !lineTextRaw || !Array.isArray(submatches) || submatches.length === 0) {
								return;
							}

							matchedFiles.add(relPath);
							globalMatchedFiles.add(`${folder.name}::${relPath}`);
							const lineText = lineTextRaw.replace(/\r?\n$/, '');
							const previewText = truncatePreview(sanitizePreview(lineText), options.previewMaxChars);

							for (const sm of submatches) {
								if (globalMatchCount >= options.maxResults) {
									truncated = true;
									globallyTruncated = true;
									killForLimit();
									return;
								}
								const col = byteOffsetToVscodeColumn(lineText, sm.start);
								matches.push({ relativePath: relPath.replace(/\\/g, '/'), line: lineNumber, col, preview: previewText });
								globalMatchCount++;

								if (onProgress) {
									const now = Date.now();
									if (now - lastProgressMs >= 200) {
										lastProgressMs = now;
										onProgress({
											matchesFound: globalMatchCount,
											filesSeen: globalMatchedFiles.size,
											elapsedMs: now - startedAtMs,
										});
									}
								}
							}
						});

						proc.on('error', (err) => {
							rl.close();
							reject(err);
						});

						proc.on('close', (code, signal) => {
							rl.close();
							if (cts.token.isCancellationRequested) {
								resolve();
								return;
							}
							// ripgrep: 0 = match, 1 = no match, 2 = error
							if (code === 0 || code === 1 || signal === 'SIGTERM' || signal === 'SIGKILL') {
								resolve();
								return;
							}
							reject(new Error(stderr.trim() || `ripgrep failed with code ${code ?? 'null'}`));
						});
					});
				} finally {
					cancelSubscription.dispose();
					rl.close();
				}

				sets.push({
					timestamp,
					query,
					rootName: folder.name,
					includes: options.includes,
					excludes: options.excludes,
					totalFiles: matchedFiles.size,
					totalMatches: matches.length,
					truncated: truncated || globallyTruncated,
					matches,
				});
			}

			if (globallyTruncated) {
				for (const s of sets) {
					s.truncated = true;
				}
			}

			if (onProgress) {
				onProgress({
					matchesFound: globalMatchCount,
					filesSeen: globalMatchedFiles.size,
					elapsedMs: Date.now() - startedAtMs,
				});
			}

			return { sets };
		} finally {
			subscription.dispose();
			cts.dispose();
		}
	}
}
