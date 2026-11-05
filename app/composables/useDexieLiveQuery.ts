import { liveQuery, type Observable, type Subscription } from 'dexie';
import { shallowRef, watch, onScopeDispose, type ShallowRef, type WatchSource } from 'vue';

/**
 * Connects a Dexie liveQuery to a reactive Vue 3 ShallowRef.
 * Automatically tracks both IndexedDB table modifications and optional Vue reactive dependencies,
 * cleans up subscriptions on unmount, and handles SSR isolation safely.
 */
export function useDexieLiveQuery<T>(
	querier: () => Promise<T> | T,
	initialValue: T,
	deps?: WatchSource | WatchSource[]
): ShallowRef<T> {
	const state = shallowRef<T>(initialValue);

	if (!import.meta.client) {
		return state;
	}

	let subscription: Subscription | null = null;

	function cleanup() {
		if (subscription) {
			subscription.unsubscribe();
			subscription = null;
		}
	}

	function subscribeQuery() {
		cleanup();
		try {
			const observable: Observable<T> = liveQuery(querier);
			subscription = observable.subscribe({
				next: (val) => {
					state.value = val;
				},
				error: (err) => {
					console.error('[Dexie liveQuery] Subscription error:', err);
				}
			});
		} catch (err) {
			console.error('[Dexie liveQuery] Initialization error:', err);
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
