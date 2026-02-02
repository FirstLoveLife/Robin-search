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

			const untitled = await vscode.workspace.openTextDocument({ content: 'keep editor intact' });
			await vscode.window.showTextDocument(untitled, { preview: false });
			const before = vscode.window.activeTextEditor;
			assert.ok(before);
			assert.strictEqual(before.document.uri.scheme, 'untitled');

			const targetUri = vscode.Uri.joinPath(wsFolder.uri, match.relativePath);
			await vscode.commands.executeCommand('robinSearch.previewMatch', { targetUri: targetUri.toString(), line: match.line, col: match.col, runId: runs[0].runId });

			const apiNav = api.nav.getReturnTarget();
			assert.ok(apiNav);
			assert.strictEqual(apiNav.viewId, 'robinSearch.results');
			assert.strictEqual(apiNav.runId, runs[0].runId);

			const active = vscode.window.activeTextEditor;
			assert.ok(active);
			assert.strictEqual(active.document.uri.scheme, 'untitled');

			// Should not throw; best-effort focus back to Results.
			await vscode.commands.executeCommand('robinSearch.backToResults');
		});
	});
});
