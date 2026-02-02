export interface RobinSearchReturnTarget {
	viewId: 'robinSearch.results' | 'robinSearch.search';
	runId?: string;
}

export interface RobinSearchCurrentMatch {
	runId: string;
	rootName: string;
	relativePath: string;
	line: number;
	col?: number;
}

export class NavigationState {
	private lastReturnTarget: RobinSearchReturnTarget | undefined;
	private currentMatch: RobinSearchCurrentMatch | undefined;

	public setReturnTarget(target: RobinSearchReturnTarget): void {
		this.lastReturnTarget = target;
	}

	public getReturnTarget(): RobinSearchReturnTarget | undefined {
		return this.lastReturnTarget;
	}

	public setCurrentMatch(match: RobinSearchCurrentMatch): void {
		this.currentMatch = match;
	}

	public getCurrentMatch(): RobinSearchCurrentMatch | undefined {
		return this.currentMatch;
	}

	public clear(): void {
		this.lastReturnTarget = undefined;
		this.currentMatch = undefined;
	}
}
