import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// Some environments set this for Electron-based CLIs. It breaks VS Code test runner.
		delete process.env.ELECTRON_RUN_AS_NODE;

		const extensionDevelopmentPath = path.resolve(__dirname, '../../');
		const extensionTestsPath = path.resolve(__dirname, './suite/index');
		const workspacePath = path.resolve(__dirname, '../../src/test-fixture/workspace');

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [workspacePath, '--disable-extensions'],
		});
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main();
