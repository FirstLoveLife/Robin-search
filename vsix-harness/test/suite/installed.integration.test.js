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
		assert.strictEqual(api.mode.get(), 'results');

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
		await vscode.commands.executeCommand('robinSearch.openMatchFromResults', {
			targetUri: targetUri.toString(),
			rootName: firstSet.rootName,
			relativePath: match.relativePath,
			line: match.line,
			col: match.col,
			runId: runs[0].runId,
		});
		assert.strictEqual(api.mode.get(), 'results');
		const active = vscode.window.activeTextEditor;
		assert.ok(active);
		assert.strictEqual(active.document.uri.scheme, 'file');
		assert.ok(active.document.uri.fsPath.endsWith('hello.txt'));
		assert.strictEqual(active.selection.active.line, match.line - 1);

		const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
		assert.ok(tab);
		assert.strictEqual(tab.isPreview, false);

		await vscode.commands.executeCommand('robinSearch.nextResult');
		const activeAfterNext = vscode.window.activeTextEditor;
		assert.ok(activeAfterNext);
		assert.ok(activeAfterNext.document.uri.fsPath.endsWith('hello.txt'));
		assert.strictEqual(activeAfterNext.selection.active.line, match.line - 1);

		await vscode.commands.executeCommand('robinSearch.previousResult');
		const activeAfterPrev = vscode.window.activeTextEditor;
		assert.ok(activeAfterPrev);
		assert.ok(activeAfterPrev.document.uri.fsPath.endsWith('hello.txt'));
		assert.strictEqual(activeAfterPrev.selection.active.line, match.line - 1);

		await vscode.commands.executeCommand('robinSearch.backToResults');
		assert.strictEqual(api.mode.get(), 'results');
	});
});
