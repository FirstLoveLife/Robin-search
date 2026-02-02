import * as assert from 'assert';
import * as vscode from 'vscode';
import { ResultsViewProvider } from '../../views/resultsView';
import { RobinSearchApi } from '../../extension';

suite('UI + logic', function () {
	this.timeout(20000);

	test('Activity Bar view command exists and Results view updates', async () => {
		const ext = vscode.extensions.getExtension('firstlove.robin-search');
		assert.ok(ext);
		const api = (await ext.activate()) as RobinSearchApi;

		await api.results.clear();

		const allCommands = await vscode.commands.getCommands(true);
		assert.ok(allCommands.includes('workbench.view.extension.robinSearch'));
		assert.ok(allCommands.includes('robinSearch.runSearch'));
		assert.ok(allCommands.includes('robinSearch.clearResults'));

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

		const provider = new ResultsViewProvider(api.results);
		const root = (await Promise.resolve(provider.getChildren(undefined))) as any[];
		assert.ok(root.length >= 1);
		provider.dispose();
	});
});
