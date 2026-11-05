import { liveQuery, type Observable, type Subscription } from 'dexie';
import { ref, shallowRef, watch, onScopeDispose, type Ref, type ShallowRef, type WatchSource } from 'vue';

export type DexieLiveQueryRef<T> = ShallowRef<T> & {
	isLoading: Ref<boolean>;
};

/**
 * Connects a Dexie liveQuery to a reactive Vue 3 ShallowRef with an attached `isLoading` state.
 * Automatically tracks both IndexedDB table modifications and optional Vue reactive dependencies,
 * cleans up subscriptions on unmount, and handles SSR isolation safely.
 */
export function useDexieLiveQuery<T>(
	querier: () => Promise<T> | T,
	initialValue: T,
	deps?: WatchSource | WatchSource[]
): DexieLiveQueryRef<T> {
	const isLoading = ref<boolean>(Boolean(import.meta.client));
	const state = Object.assign(shallowRef<T>(initialValue), {
		isLoading
	}) as DexieLiveQueryRef<T>;

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
		isLoading.value = true;
		try {
			const observable: Observable<T> = liveQuery(querier);
			subscription = observable.subscribe({
				next: (val) => {
					state.value = val;
					isLoading.value = false;
				},
				error: (err) => {
					console.error('[Dexie liveQuery] Subscription error:', err);
					isLoading.value = false;
				}
			});
		} catch (err) {
			console.error('[Dexie liveQuery] Initialization error:', err);
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
