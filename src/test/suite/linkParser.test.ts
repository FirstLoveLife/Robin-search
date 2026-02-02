import * as assert from 'assert';
import { parseAsrMatchLine } from '../../services/linkParser';

suite('LinkParser', () => {
	test('parses unix path with col', () => {
		const parsed = parseAsrMatchLine('src/main.c:12:3: hello');
		assert.ok(parsed);
		assert.strictEqual(parsed.path, 'src/main.c');
		assert.strictEqual(parsed.line, 12);
		assert.strictEqual(parsed.col, 3);
	});

	test('parses windows drive letter path', () => {
		const parsed = parseAsrMatchLine('C:\\\\foo\\\\bar.c:12:3: hello');
		assert.ok(parsed);
		assert.strictEqual(parsed.path, 'C:\\\\foo\\\\bar.c');
		assert.strictEqual(parsed.line, 12);
		assert.strictEqual(parsed.col, 3);
	});

	test('parses line without col (line::)', () => {
		const parsed = parseAsrMatchLine('src/main.c:12:: hello');
		assert.ok(parsed);
		assert.strictEqual(parsed.path, 'src/main.c');
		assert.strictEqual(parsed.line, 12);
		assert.strictEqual(parsed.col, undefined);
	});

	test('tolerates malformed lines', () => {
		assert.strictEqual(parseAsrMatchLine('not a match line'), undefined);
		assert.strictEqual(parseAsrMatchLine('## heading'), undefined);
		assert.strictEqual(parseAsrMatchLine('--'), undefined);
	});
});

