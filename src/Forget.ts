import { type App, SuggestModal } from 'obsidian';

const HOUR = 60 * 60 * 1000;

export interface ForgetPeriod {
	id: string;
	label: string;
	// how far back to forget, in milliseconds; 0 means everything
	duration: number;
}

export const FORGET_PERIODS: ForgetPeriod[] = [
	{ id: 'hour', label: 'Last hour', duration: HOUR },
	{ id: 'day', label: 'Last 24 hours', duration: 24 * HOUR },
	{ id: 'week', label: 'Last 7 days', duration: 7 * 24 * HOUR },
	{ id: 'month', label: 'Last 30 days', duration: 30 * 24 * HOUR },
	{ id: 'all', label: 'Everything', duration: 0 },
];

// Start time for forgetting: files processed at or after it are forgotten.
export function forgetSinceTime(period: ForgetPeriod): number {
	return period.duration === 0 ? 0 : Date.now() - period.duration;
}

export class ForgetPeriodModal extends SuggestModal<ForgetPeriod> {
	private onChoose: (period: ForgetPeriod) => void;

	constructor(app: App, onChoose: (period: ForgetPeriod) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Forget files processed in…');
	}

	getSuggestions(query: string): ForgetPeriod[] {
		const lowerCaseQuery = query.toLowerCase();
		return FORGET_PERIODS.filter((period) =>
			period.label.toLowerCase().includes(lowerCaseQuery)
		);
	}

	renderSuggestion(period: ForgetPeriod, el: HTMLElement): void {
		el.setText(period.label);
	}

	onChooseSuggestion(period: ForgetPeriod): void {
		this.onChoose(period);
	}
}
