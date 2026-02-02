const fs = require('fs');
const path = require('path');

function main() {
	const repoRoot = path.resolve(__dirname, '..');
	const outDir = path.join(repoRoot, 'out');
	try {
		fs.rmSync(outDir, { recursive: true, force: true });
	} catch {
		// ignore
	}
}

main();

