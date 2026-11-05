import type { HabitDailyPoint } from '~/domain/schemas';

export const CHART_DIMENSIONS = {
	SVG_WIDTH: 860,
	SVG_HEIGHT: 250,
	PAD_TOP: 26,
	PAD_BOTTOM: 34,
	PAD_LEFT: 36,
	PAD_RIGHT: 44,
	get PLOT_W() {
		return this.SVG_WIDTH - this.PAD_LEFT - this.PAD_RIGHT;
	},
	get PLOT_H() {
		return this.SVG_HEIGHT - this.PAD_TOP - this.PAD_BOTTOM;
	}
} as const;

export function computeMaxCadenceMinutes(
	dailySeries: ReadonlyArray<HabitDailyPoint>,
	defaultMinutes: number
): number {
	let maxVal = defaultMinutes || 15;
	for (const pt of dailySeries) {
		if ((pt.actualMinutes ?? 0) > maxVal) maxVal = pt.actualMinutes ?? 0;
		if ((pt.plannedMinutes ?? 0) > maxVal) maxVal = pt.plannedMinutes ?? 0;
	}
	return Math.max(10, Math.ceil(maxVal / 5) * 5);
}

export function getChartX(index: number, total: number): number {
	const { PAD_LEFT, PLOT_W } = CHART_DIMENSIONS;
	if (total <= 1) return PAD_LEFT + PLOT_W / 2;
	const step = PLOT_W / (total - 1);
	return PAD_LEFT + index * step;
}

export function getChartYFromScore(score: number): number {
	const { PAD_TOP, PLOT_H } = CHART_DIMENSIONS;
	const clamped = Math.max(0, Math.min(100, score));
	return PAD_TOP + PLOT_H - (clamped / 100) * PLOT_H;
}

export function getChartYFromMinutes(minutes: number, maxCadenceMinutes: number): number {
	const { PAD_TOP, PLOT_H } = CHART_DIMENSIONS;
	const clamped = Math.max(0, Math.min(maxCadenceMinutes, minutes));
	return PAD_TOP + PLOT_H - (clamped / maxCadenceMinutes) * PLOT_H;
}

export function buildRollingPolylinePoints(
	series: ReadonlyArray<HabitDailyPoint>,
	isCadence: boolean,
	maxCadenceMinutes: number
): string {
	const pts: string[] = [];
	for (let i = 0; i < series.length; i++) {
		const pt = series[i];
		if (!pt) continue;
		const x = getChartX(i, series.length);
		if (isCadence) {
			if (pt.plannedMinutes !== null && pt.plannedMinutes > 0) {
				pts.push(
					`${x.toFixed(1)},${getChartYFromMinutes(pt.plannedMinutes, maxCadenceMinutes).toFixed(1)}`
				);
			}
		} else if (pt.rollingAvgScore !== null) {
			pts.push(`${x.toFixed(1)},${getChartYFromScore(pt.rollingAvgScore).toFixed(1)}`);
		}
	}
	return pts.join(' ');
}

export function buildRollingAreaPath(
	series: ReadonlyArray<HabitDailyPoint>,
	isCadence: boolean,
	maxCadenceMinutes: number
): string {
	const { PAD_TOP, PLOT_H } = CHART_DIMENSIONS;
	const coords: Array<{ x: number; y: number }> = [];
	for (let i = 0; i < series.length; i++) {
		const pt = series[i];
		if (!pt) continue;
		const x = getChartX(i, series.length);
		if (!isCadence && pt.rollingAvgScore !== null) {
			coords.push({ x, y: getChartYFromScore(pt.rollingAvgScore) });
		} else if (isCadence && pt.actualMinutes !== null) {
			coords.push({ x, y: getChartYFromMinutes(pt.actualMinutes, maxCadenceMinutes) });
		}
	}
	if (coords.length < 2) return '';
	const baselineY = PAD_TOP + PLOT_H;
	const first = coords[0];
	const last = coords[coords.length - 1];
	if (!first || !last) return '';
	const lineSegments = coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
	return `M ${first.x.toFixed(1)} ${baselineY} ${lineSegments} L ${last.x.toFixed(1)} ${baselineY} Z`;
}
