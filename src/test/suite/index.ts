import * as path from 'path';
import * as fs from 'fs';
import Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
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

export function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'tdd', color: true });
	const testsRoot = path.resolve(__dirname, '.');

	return new Promise((resolve, reject) => {
		try {
			for (const file of findTestFiles(testsRoot)) {
				mocha.addFile(file);
			}

			try {
				mocha.run((failures: number) => {
					if (failures > 0) {
						reject(new Error(`${failures} tests failed.`));
					} else {
						resolve();
					}
				});
			} catch (e) {
				reject(e);
			}
		} catch (e) {
			reject(e);
		}
	});
}
