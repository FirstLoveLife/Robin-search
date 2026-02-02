/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path');
const fs = require('fs');
const { runTests, runVSCodeCommand } = require('@vscode/test-electron');

async function main() {
	// Some environments set this for Electron-based CLIs. It breaks VS Code runs.
	delete process.env.ELECTRON_RUN_AS_NODE;

	const repoRoot = path.resolve(__dirname, '..');
	const vsixPath = path.join(repoRoot, 'robin-search.vsix');
	if (!fs.existsSync(vsixPath)) {
		throw new Error(`VSIX not found at ${vsixPath}`);
	}

	// Install VSIX into the test profile extensions-dir (default: .vscode-test/extensions).
	await runVSCodeCommand(['--install-extension', vsixPath, '--force']);

	// Run tests from a dedicated harness extension. The installed extension is what we validate.
	const extensionDevelopmentPath = path.join(repoRoot, 'vsix-harness');
	const extensionTestsPath = path.join(repoRoot, 'vsix-harness', 'test', 'index.js');
	const workspacePath = path.join(repoRoot, 'src', 'test-fixture', 'workspace');

	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [workspacePath],
	});
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

