import { getTodayIso, shiftIsoDate } from '~/domain/calendar';

const liveTodayIso = ref(getTodayIso());
let activeSubscribers = 0;
let checkIntervalId: ReturnType<typeof setInterval> | null = null;

function refreshTodayIso() {
	const current = getTodayIso();
	if (liveTodayIso.value !== current) {
		liveTodayIso.value = current;
	}
}

function handleVisibilityOrFocus() {
	if (typeof document === 'undefined' || document.visibilityState === 'visible') {
		refreshTodayIso();
	}
}

export function useLiveTodayIso() {
	if (import.meta.client) {
		refreshTodayIso();

		onMounted(() => {
			activeSubscribers++;
			if (activeSubscribers === 1) {
				window.addEventListener('focus', handleVisibilityOrFocus);
				document.addEventListener('visibilitychange', handleVisibilityOrFocus);
				checkIntervalId = setInterval(refreshTodayIso, 30 * 1000);
			}
		});

		onScopeDispose(() => {
			activeSubscribers = Math.max(0, activeSubscribers - 1);
			if (activeSubscribers === 0) {
				window.removeEventListener('focus', handleVisibilityOrFocus);
				document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
				if (checkIntervalId) {
					clearInterval(checkIntervalId);
					checkIntervalId = null;
				}
			}
		});
	}

	const yesterdayIso = computed(() => shiftIsoDate(liveTodayIso.value, -1));

	return {
		todayIso: readonly(liveTodayIso),
		yesterdayIso,
		refreshTodayIso
	};
}
