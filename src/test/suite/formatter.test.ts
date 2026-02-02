import * as assert from 'assert';
import { createAsrResultsSetText, sanitizePreview, truncatePreview } from '../../services/formatter';

suite('Formatter', () => {
	test('truncatePreview adds ellipsis', () => {
		assert.strictEqual(truncatePreview('abcdef', 3), 'ab…');
		assert.strictEqual(truncatePreview('abcdef', 6), 'abcdef');
	});

	test('sanitizePreview removes newlines', () => {
		assert.strictEqual(sanitizePreview('hello\nworld\r\nx'), 'hello world x');
	});

	test('createAsrResultsSetText basic shape', () => {
		const text = createAsrResultsSetText({
			timestamp: new Date('2026-02-02T13:15:03Z'),
			query: { pattern: 'foo', isRegExp: false, isCaseSensitive: false, isWordMatch: false },
			rootName: 'ws',
			includes: '**/*',
			excludes: '',
			totalFiles: 1,
			totalMatches: 1,
			truncated: false,
			matches: [{ relativePath: 'a/b.txt', line: 12, col: 3, preview: 'foo bar' }],
		});

		assert.ok(text.startsWith('## ['));
		assert.ok(text.includes('pattern="foo"'));
		assert.ok(text.includes('## root="ws"'));
		assert.ok(text.includes('a/b.txt:12:3: foo bar'));
		assert.ok(text.trimEnd().endsWith('--'));
	});
});
