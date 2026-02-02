export interface RobinSearchReturnTarget {
	viewId: 'robinSearch.results' | 'robinSearch.search';
	runId?: string;
}

export class NavigationState {
	private lastReturnTarget: RobinSearchReturnTarget | undefined;

	public setReturnTarget(target: RobinSearchReturnTarget): void {
		this.lastReturnTarget = target;
	}

	public getReturnTarget(): RobinSearchReturnTarget | undefined {
		return this.lastReturnTarget;
	}

	public clear(): void {
		this.lastReturnTarget = undefined;
	}
}

