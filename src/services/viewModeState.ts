import * as vscode from 'vscode';

export type RobinSearchViewMode = 'results' | 'file';

export class ViewModeState {
	private mode: RobinSearchViewMode = 'results';

	public get(): RobinSearchViewMode {
		return this.mode;
	}

	public async set(mode: RobinSearchViewMode): Promise<void> {
		this.mode = mode;
		await vscode.commands.executeCommand('setContext', 'robinSearch.mode', mode);
	}
}

