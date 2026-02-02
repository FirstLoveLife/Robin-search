const path = require('path');
const fs = require('fs');
const Mocha = require('mocha');

function findTestFiles(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) {
			files.push(...findTestFiles(full));
			continue;
		}
		if (e.isFile() && e.name.endsWith('.test.js')) {
			files.push(full);
		}
	}
	return files;
}

function run() {
	const mocha = new Mocha({ ui: 'tdd', color: true });
	const testsRoot = path.resolve(__dirname, 'suite');

	for (const file of findTestFiles(testsRoot)) {
		mocha.addFile(file);
	}

	return new Promise((resolve, reject) => {
		mocha.run((failures) => {
			if (failures > 0) {
				reject(new Error(`${failures} tests failed.`));
			} else {
				resolve();
			}
		});
	});
}

module.exports = { run };

