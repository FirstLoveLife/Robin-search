import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { RobinSearchApi } from '../../extension';

suite('Extension integration', () => {
	suite('Search + results', function () {
		this.timeout(15000);

		test('runSearch stores results and can open a match', async () => {
			const ext = vscode.extensions.getExtension('firstlove.robin-search');
			assert.ok(ext);
			const api = (await ext.activate()) as RobinSearchApi;

			await api.results.clear();

			const wsFolder = vscode.workspace.workspaceFolders?.[0];
			assert.ok(wsFolder);

			await vscode.commands.executeCommand('robinSearch.runSearch', {
				pattern: 'hello',
				includes: '**/*.txt',
				excludes: '',
				workspaceFolderName: wsFolder.name,
				isRegExp: false,
				isCaseSensitive: false,
				isWordMatch: false,
				respectExcludes: true,
			});

			const runs = api.results.list();
			assert.ok(runs.length >= 1);
			assert.strictEqual(runs[0].query.pattern, 'hello');

			const firstSet = runs[0].sets[0];
			assert.ok(firstSet);
			const match = firstSet.matches.find((m) => m.relativePath.endsWith('hello.txt'));
			assert.ok(match);
			assert.strictEqual(match.line, 1);

			const targetUri = vscode.Uri.joinPath(wsFolder.uri, match.relativePath);
			await vscode.commands.executeCommand('robinSearch.openMatch', { targetUri: targetUri.toString(), line: match.line, col: match.col });

			const active = vscode.window.activeTextEditor;
			assert.ok(active);
			assert.strictEqual(active.document.uri.fsPath, path.join(wsFolder.uri.fsPath, 'hello.txt'));
			assert.strictEqual(active.selection.active.line, 0);
			assert.strictEqual(active.selection.active.character, 0);
	});
});
});
