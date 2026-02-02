import * as vscode from 'vscode';

const STORAGE_FILE_NAME = 'results.json';

export interface SearchQuery {
	pattern: string;
	isRegExp: boolean;
	isCaseSensitive: boolean;
	isWordMatch: boolean;
}

export interface SearchMatch {
	relativePath: string;
	line: number;
	col?: number;
	preview: string;
}

export interface SearchRunSet {
	rootName: string;
	totalFiles: number;
	totalMatches: number;
	truncated: boolean;
	matches: SearchMatch[];
}

export interface SearchRun {
	runId: string;
	timestampMs: number;

	query: SearchQuery;
	rootName: string;
	includes: string;
	excludes: string;
	respectExcludes: boolean;
	maxResults: number;

	totalMatches: number;
	totalFiles: number;
	elapsedMs: number;
	truncated: boolean;
	cancelled: boolean;

	sets: SearchRunSet[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeNumber(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function safeBool(value: unknown, fallback = false): boolean {
	return typeof value === 'boolean' ? value : fallback;
}

function safeQuery(value: unknown): SearchQuery | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	return {
		pattern: safeString(value.pattern),
		isRegExp: safeBool(value.isRegExp),
		isCaseSensitive: safeBool(value.isCaseSensitive),
		isWordMatch: safeBool(value.isWordMatch),
	};
}

function safeMatch(value: unknown): SearchMatch | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const line = safeNumber(value.line, 0);
	if (!Number.isFinite(line) || line <= 0) {
		return undefined;
	}
	const col = safeNumber(value.col, 0);
	return {
		relativePath: safeString(value.relativePath),
		line,
		col: col > 0 ? col : undefined,
		preview: safeString(value.preview),
	};
}

function safeRunSet(value: unknown): SearchRunSet | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const matchesRaw = Array.isArray(value.matches) ? value.matches : [];
	const matches: SearchMatch[] = [];
	for (const m of matchesRaw) {
		const parsed = safeMatch(m);
		if (parsed) {
			matches.push(parsed);
		}
	}
	return {
		rootName: safeString(value.rootName),
		totalFiles: safeNumber(value.totalFiles, 0),
		totalMatches: safeNumber(value.totalMatches, matches.length),
		truncated: safeBool(value.truncated),
		matches,
	};
}

function safeRun(value: unknown): SearchRun | undefined {
	if (!isRecord(value)) {
		return undefined;
	}
	const query = safeQuery(value.query);
	if (!query || !safeString(value.runId) || !safeNumber(value.timestampMs)) {
		return undefined;
	}

	const setsRaw = Array.isArray(value.sets) ? value.sets : [];
	const sets: SearchRunSet[] = [];
	for (const s of setsRaw) {
		const parsed = safeRunSet(s);
		if (parsed) {
			sets.push(parsed);
		}
	}

	return {
		runId: safeString(value.runId),
		timestampMs: safeNumber(value.timestampMs),

		query,
		rootName: safeString(value.rootName),
		includes: safeString(value.includes, '**/*'),
		excludes: safeString(value.excludes),
		respectExcludes: safeBool(value.respectExcludes, true),
		maxResults: safeNumber(value.maxResults, 20000),

		totalMatches: safeNumber(value.totalMatches, 0),
		totalFiles: safeNumber(value.totalFiles, 0),
		elapsedMs: safeNumber(value.elapsedMs, 0),
		truncated: safeBool(value.truncated),
		cancelled: safeBool(value.cancelled),

		sets,
	};
}

export class ResultsStore {
	private runs: SearchRun[] = [];
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(private readonly context: vscode.ExtensionContext, private readonly maxRuns = 50) {}

	public list(): SearchRun[] {
		return [...this.runs];
	}

	public get(runId: string): SearchRun | undefined {
		return this.runs.find((r) => r.runId === runId);
	}

	public async load(): Promise<void> {
		const fileUri = await this.getStorageFileUri();
		if (!fileUri) {
			return;
		}

		try {
			const raw = await vscode.workspace.fs.readFile(fileUri);
			const text = Buffer.from(raw).toString('utf8');
			const parsed = JSON.parse(text) as unknown;
			if (!Array.isArray(parsed)) {
				return;
			}

			const loaded: SearchRun[] = [];
			for (const entry of parsed) {
				const run = safeRun(entry);
				if (run) {
					loaded.push(run);
				}
			}
			this.runs = loaded.slice(0, this.maxRuns);
		} catch {
			// ignore missing/invalid storage
		}
	}

	public async add(run: SearchRun): Promise<void> {
		this.runs = [run, ...this.runs.filter((r) => r.runId !== run.runId)].slice(0, this.maxRuns);
		await this.enqueueSave();
	}

	public async delete(runId: string): Promise<void> {
		this.runs = this.runs.filter((r) => r.runId !== runId);
		await this.enqueueSave();
	}

	public async clear(): Promise<void> {
		this.runs = [];
		await this.enqueueSave();
	}

	private enqueueSave(): Promise<void> {
		this.writeQueue = this.writeQueue.then(
			() => this.saveNow(),
			() => this.saveNow(),
		);
		return this.writeQueue;
	}

	private async saveNow(): Promise<void> {
		const fileUri = await this.getStorageFileUri();
		if (!fileUri) {
			return;
		}

		const data = JSON.stringify(this.runs);
		await vscode.workspace.fs.writeFile(fileUri, Buffer.from(data, 'utf8'));
	}

	private async getStorageFileUri(): Promise<vscode.Uri | undefined> {
		const dir = this.context.storageUri ?? this.context.globalStorageUri;
		if (!dir) {
			return undefined;
		}
		try {
			await vscode.workspace.fs.createDirectory(dir);
		} catch {
			// ignore
		}
		return vscode.Uri.joinPath(dir, STORAGE_FILE_NAME);
	}
}

