import * as path from 'path';
import * as vscode from 'vscode';
import { parseAsrMatchLine } from './linkParser';

function isProbablyAbsoluteFsPath(text: string): boolean {
	if (path.isAbsolute(text)) {
		return true;
	}
	if (/^[A-Za-z]:[\\/]/.test(text)) {
		return true;
	}
	if (/^\\\\/.test(text)) {
		return true;
	}
	return false;
}

function parseRootHeading(text: string): string | undefined {
	const m = text.match(/^##\s+root="([^"]+)"/);
	return m?.[1];
}

function resolveTargetUri(pathText: string, rootName: string | undefined): vscode.Uri | undefined {
	if (isProbablyAbsoluteFsPath(pathText)) {
		return vscode.Uri.file(pathText);
	}
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (folders.length === 0) {
		return undefined;
	}
	const folder = rootName ? folders.find((f) => f.name === rootName) ?? folders[0] : folders[0];
	const absFsPath = path.join(folder.uri.fsPath, pathText);
	return vscode.Uri.file(absFsPath);
}

export class AsrDocumentLinkProvider implements vscode.DocumentLinkProvider {
	public provideDocumentLinks(document: vscode.TextDocument): vscode.ProviderResult<vscode.DocumentLink[]> {
		const links: vscode.DocumentLink[] = [];
		let currentRootName: string | undefined;

		for (let i = 0; i < document.lineCount; i++) {
			const lineText = document.lineAt(i).text;
			const root = parseRootHeading(lineText);
			if (root) {
				currentRootName = root;
				continue;
			}

			const parsed = parseAsrMatchLine(lineText);
			if (!parsed) {
				continue;
			}

			const target = resolveTargetUri(parsed.path, currentRootName);
			if (!target) {
				continue;
			}

			const args = { targetUri: target.toString(), line: parsed.line, col: parsed.col };
			const commandUri = vscode.Uri.parse(`command:robinSearch.openMatch?${encodeURIComponent(JSON.stringify(args))}`);

			const range = new vscode.Range(
				new vscode.Position(i, 0),
				new vscode.Position(i, Math.min(parsed.linkTextEndOffset, lineText.length)),
			);
			links.push(new vscode.DocumentLink(range, commandUri));
		}

		return links;
	}
}

