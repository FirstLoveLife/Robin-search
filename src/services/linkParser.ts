export interface ParsedAsrMatchLine {
	path: string;
	line: number;
	col?: number;
	linkTextEndOffset: number;
}

function isPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
}

export function parseAsrMatchLine(text: string): ParsedAsrMatchLine | undefined {
	if (!text || text.startsWith('#') || text.startsWith('##') || text.startsWith('--')) {
		return undefined;
	}

	const withCol = /:(\d+):(\d+):\s/g;
	let match: RegExpExecArray | null;
	let lastWithCol: { index: number; line: number; col: number; endExclusive: number } | undefined;
	while ((match = withCol.exec(text)) !== null) {
		const line = Number(match[1]);
		const col = Number(match[2]);
		lastWithCol = { index: match.index, line, col, endExclusive: withCol.lastIndex - 1 };
	}
	if (lastWithCol && isPositiveInteger(lastWithCol.line) && isPositiveInteger(lastWithCol.col)) {
		const pathPart = text.slice(0, lastWithCol.index).trim();
		if (!pathPart) {
			return undefined;
		}
		return {
			path: pathPart,
			line: lastWithCol.line,
			col: lastWithCol.col,
			linkTextEndOffset: lastWithCol.endExclusive,
		};
	}

	const noCol = /:(\d+)::\s/g;
	let lastNoCol: { index: number; line: number; endExclusive: number } | undefined;
	while ((match = noCol.exec(text)) !== null) {
		const line = Number(match[1]);
		lastNoCol = { index: match.index, line, endExclusive: noCol.lastIndex - 1 };
	}
	if (lastNoCol && isPositiveInteger(lastNoCol.line)) {
		const pathPart = text.slice(0, lastNoCol.index).trim();
		if (!pathPart) {
			return undefined;
		}
		return {
			path: pathPart,
			line: lastNoCol.line,
			linkTextEndOffset: lastNoCol.endExclusive,
		};
	}

	return undefined;
}

