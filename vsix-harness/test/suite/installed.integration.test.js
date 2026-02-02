const assert = require('assert');
const vscode = require('vscode');

suite('VSIX installed extension', function () {
	this.timeout(20000);

	test('commands exist and basic flow works', async () => {
		const ext = vscode.extensions.getExtension('firstlove.robin-search');
		assert.ok(ext, 'installed extension not found');
		const api = await ext.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('robinSearch.runSearch'));
		assert.ok(commands.includes('robinSearch.clearResults'));
		assert.ok(commands.includes('robinSearch.backToResults'));
		assert.ok(commands.includes('workbench.view.extension.robinSearch'));

		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		assert.ok(wsFolder);

		await api.results.clear();

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
		const active = vscode.window.activeTextEditor;
		assert.ok(active);
		assert.strictEqual(active.document.uri.scheme, 'untitled');

		await vscode.commands.executeCommand('robinSearch.backToResults');
	});
});
