import { liveQuery, type Observable } from 'dexie';
import { shallowRef, onScopeDispose, type ShallowRef } from 'vue';

/**
 * Connects a Dexie liveQuery to a reactive Vue 3 ShallowRef.
 * Automatically tracks table modifications, cleans up subscriptions on unmount,
 * and handles SSR isolation safely.
 */
export function useDexieLiveQuery<T>(
	querier: () => Promise<T> | T,
	initialValue: T
): ShallowRef<T> {
	const state = shallowRef<T>(initialValue);

	if (!import.meta.client) {
		return state;
	}

	try {
		const observable: Observable<T> = liveQuery(querier);
		const subscription = observable.subscribe({
			next: (val) => {
				state.value = val;
			},
			error: (err) => {
				console.error('[Dexie liveQuery] Subscription error:', err);
			}
		});

		onScopeDispose(() => {
			subscription.unsubscribe();
		});
	} catch (err) {
		console.error('[Dexie liveQuery] Initialization error:', err);
	}

	return state;
}
