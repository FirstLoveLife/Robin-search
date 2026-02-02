import * as vscode from 'vscode';

export interface AsrSearchQuery {
	pattern: string;
	isRegExp: boolean;
	isCaseSensitive: boolean;
	isWordMatch: boolean;
}

export interface AsrMatchLine {
	relativePath: string;
	line: number;
	col?: number;
	preview: string;
}

export interface AsrResultsSet {
	timestamp: Date;
	query: AsrSearchQuery;
	rootName: string;
	includes: string;
	excludes: string;
	totalFiles: number;
	totalMatches: number;
	truncated: boolean;
	matches: AsrMatchLine[];
}

function formatTimestamp(d: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function escapeHeadingValue(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function sanitizePreview(text: string): string {
	return text.replace(/\r\n|\r|\n/g, ' ').replace(/\u0000/g, '').trimEnd();
}

export function truncatePreview(text: string, maxChars: number): string {
	if (maxChars <= 0) {
		return text;
	}
	if (text.length <= maxChars) {
		return text;
	}
	return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function createAsrResultsSetText(set: AsrResultsSet): string {
	const mode = set.query.isRegExp ? 'regex' : 'literal';
	const caseStr = set.query.isCaseSensitive ? 'sensitive' : 'insensitive';
	const wordStr = set.query.isWordMatch ? 'true' : 'false';

	const heading1 = `## [${formatTimestamp(set.timestamp)}] pattern="${escapeHeadingValue(set.query.pattern)}" mode=${mode} case=${caseStr} word=${wordStr}`;
	const heading2 = `## root="${escapeHeadingValue(set.rootName)}" includes="${escapeHeadingValue(set.includes)}" excludes="${escapeHeadingValue(set.excludes)}"`;
	const heading3 = `## totalFiles=${set.totalFiles} totalMatches=${set.totalMatches} truncated=${set.truncated ? 'true' : 'false'}`;

	const lines: string[] = [heading1, heading2, heading3, '--'];
	for (const m of set.matches) {
		const col = m.col ?? '';
		lines.push(`${m.relativePath}:${m.line}:${col}: ${m.preview}`);
	}
	lines.push('--', '');

	return lines.join('\n');
}

export function showAsrResultsPreview(set: AsrResultsSet): vscode.MarkdownString {
	const md = new vscode.MarkdownString();
	md.appendMarkdown(`**pattern**: \`${set.query.pattern}\`\n\n`);
	md.appendMarkdown(`**matches**: \`${set.totalMatches}\`\n\n`);
	return md;
}
