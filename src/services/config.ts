import * as vscode from 'vscode';

export interface RobinSearchConfig {
	maxResults: number;
	maxMatchesPerFile: number;
	maxFileSizeKB: number;
	previewMaxChars: number;
	respectSearchExclude: boolean;
	sidebarFileMaxLines: number;
}

export function getRobinSearchConfig(): RobinSearchConfig {
	const config = vscode.workspace.getConfiguration('robinSearch');
	return {
		maxResults: config.get<number>('maxResults', 20000),
		maxMatchesPerFile: config.get<number>('maxMatchesPerFile', 2000),
		maxFileSizeKB: config.get<number>('maxFileSizeKB', 2048),
		previewMaxChars: config.get<number>('previewMaxChars', 240),
		respectSearchExclude: config.get<boolean>('respectSearchExclude', true),
		sidebarFileMaxLines: config.get<number>('sidebarFileMaxLines', 4000),
	};
}
