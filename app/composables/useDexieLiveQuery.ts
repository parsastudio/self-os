import { liveQuery, type Observable, type Subscription } from 'dexie';
import type { Ref, ShallowRef, WatchSource } from 'vue';

export type DexieLiveQueryRef<T> = ShallowRef<T> & {
	isLoading: Ref<boolean>;
	error: Ref<string | null>;
};

/**
 * Connects a Dexie liveQuery to a reactive Vue 3 ShallowRef with attached `isLoading` and `error` states.
 * Automatically tracks both IndexedDB table modifications and optional Vue reactive dependencies,
 * cleans up subscriptions on unmount, and handles SSR isolation safely.
 */
export function useDexieLiveQuery<T>(
	querier: () => Promise<T> | T,
	initialValue: T,
	deps?: WatchSource | WatchSource[]
): DexieLiveQueryRef<T> {
	const isLoading = ref<boolean>(Boolean(import.meta.client));
	const error = ref<string | null>(null);
	const state = Object.assign(shallowRef<T>(initialValue), {
		isLoading,
		error
	}) as DexieLiveQueryRef<T>;

	if (!import.meta.client) {
		return state;
	}

	let subscription: Subscription | null = null;
	let hasResolvedInitial = false;

	function cleanup() {
		if (subscription) {
			subscription.unsubscribe();
			subscription = null;
		}
	}

	function subscribeQuery() {
		cleanup();
		if (!hasResolvedInitial) {
			isLoading.value = true;
		}
		error.value = null;
		try {
			const observable: Observable<T> = liveQuery(querier);
			subscription = observable.subscribe({
				next: (val) => {
					state.value = val;
					hasResolvedInitial = true;
					error.value = null;
					isLoading.value = false;
				},
				error: (err) => {
					console.error('[Dexie liveQuery] Subscription error:', err);
					error.value = err instanceof Error ? err.message : 'خطا در خواندن پایگاه داده محلی';
					isLoading.value = false;
				}
			});
		} catch (err) {
			console.error('[Dexie liveQuery] Initialization error:', err);
			error.value = err instanceof Error ? err.message : 'خطا در راه‌اندازی کوئری محلی';
			isLoading.value = false;
		}
	}

	if (deps) {
		watch(deps, () => {
			subscribeQuery();
		}, { immediate: true });
	} else {
		subscribeQuery();
	}

	onScopeDispose(() => {
		cleanup();
	});

	return state;
}
