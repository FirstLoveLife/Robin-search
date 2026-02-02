import * as vscode from 'vscode';

const LAST_FORM_KEY = 'robinSearch.ui.lastForm';

export interface SearchFormState {
	pattern: string;
	isRegExp: boolean;
	isCaseSensitive: boolean;
	isWordMatch: boolean;

	rootName?: string;
	includes: string;
	excludes: string;
	respectExcludes: boolean;

	maxResults?: number;
}

export class SearchUiState {
	constructor(private readonly workspaceState: vscode.Memento) {}

	public getLastFormState(): Partial<SearchFormState> {
		const raw = this.workspaceState.get<unknown>(LAST_FORM_KEY);
		if (!raw || typeof raw !== 'object') {
			return {};
		}
		return raw as Partial<SearchFormState>;
	}

	public async setLastFormState(state: Partial<SearchFormState>): Promise<void> {
		const prev = this.getLastFormState();
		await this.workspaceState.update(LAST_FORM_KEY, { ...prev, ...state });
	}
}
