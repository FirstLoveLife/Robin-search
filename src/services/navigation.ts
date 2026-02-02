import * as vscode from 'vscode';
import { parseAsrMatchLine } from './linkParser';

export function findNextMatchLine(document: vscode.TextDocument, startLine: number): number | undefined {
	for (let i = Math.max(0, startLine); i < document.lineCount; i++) {
		if (parseAsrMatchLine(document.lineAt(i).text)) {
			return i;
		}
	}
	return undefined;
}

export function findPreviousMatchLine(document: vscode.TextDocument, startLine: number): number | undefined {
	for (let i = Math.min(startLine, document.lineCount - 1); i >= 0; i--) {
		if (parseAsrMatchLine(document.lineAt(i).text)) {
			return i;
		}
	}
	return undefined;
}

