import { navigateTo } from '#app';
import { useClientAuth } from '~/composables/useClientAuth';
import { onLocalMutationStaged, useLocalRepository } from '~/composables/useLocalRepository';
import { extractApiErrorInfo, type ServerSyncResponse, type SyncStatusVisual } from '~/domain/schemas';

export type { SyncStatusVisual };

const status = ref<SyncStatusVisual>('synced');
const pendingCount = ref(0);
const isOnline = ref(true);
const lastSyncedAtIso = ref<string | null>(null);
const knownServerVersionIso = ref<string | null>(null);
const lastErrorMessage = ref<string | null>(null);

let isInitialized = false;
let isSyncInFlight = false;
let hasQueuedSyncDuringFlight = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let periodicPollTimer: ReturnType<typeof setInterval> | null = null;
let unsubscribeMutationStaged: (() => void) | null = null;
let retryAttempt = 0;

export function useSyncEngine() {
	const localRepo = useLocalRepository();
	const clientAuth = useClientAuth();

	async function refreshPendingCount(): Promise<number> {
		if (!import.meta.client) return 0;
		const list = await localRepo.getPendingMutations();
		pendingCount.value = list.length;
		return list.length;
	}

	async function syncNow(options?: { checkRemoteUpdates?: boolean }): Promise<boolean> {
		if (!import.meta.client) return false;

		if (!navigator.onLine) {
			isOnline.value = false;
			status.value = 'offline';
			return false;
		}

		if (isSyncInFlight) {
			hasQueuedSyncDuringFlight = true;
			return false;
		}
		isSyncInFlight = true;
		hasQueuedSyncDuringFlight = false;

		try {
			const meta = await localRepo.getSyncMeta();
			knownServerVersionIso.value = meta.knownServerVersionIso;
			lastSyncedAtIso.value = meta.lastSyncedAtIso;

			const mutations = await localRepo.getPendingMutations();
			pendingCount.value = mutations.length;

			if (mutations.length === 0 && !options?.checkRemoteUpdates) {
				status.value = 'synced';
				lastErrorMessage.value = null;
				isSyncInFlight = false;
				return true;
			}

			status.value = mutations.length > 0 ? 'syncing' : 'synced';

			const data = await $fetch<ServerSyncResponse>('/api/sync', {
				method: 'POST',
				body: {
					clientId: meta.clientId || 'nuxt-client',
					knownServerVersionIso: knownServerVersionIso.value,
					mutations
				}
			});

			if (!data.ok) {
				throw new Error(data.error || 'خطا در پردازش بسته همگام‌سازی');
			}

			const appliedSet = new Set(data.appliedMutationIds);
			const appliedSnapshots = mutations
				.filter((m) => appliedSet.has(m.id))
				.map((m) => ({ id: m.id, queuedAtIso: m.queuedAtIso }));

			await localRepo.removeAppliedMutations(appliedSnapshots);

			if (data.fullWorkspace) {
				await localRepo.applyServerWorkspace(data.fullWorkspace);
			}

			knownServerVersionIso.value = data.serverVersionIso;
			lastSyncedAtIso.value = data.serverTimeIso;
			lastErrorMessage.value = null;
			retryAttempt = 0;

			await localRepo.saveSyncMeta({
				key: 'meta:sync',
				clientId: meta.clientId || 'nuxt-client',
				knownServerVersionIso: knownServerVersionIso.value,
				lastSyncedAtIso: lastSyncedAtIso.value
			});

			const remaining = await refreshPendingCount();
			status.value = remaining > 0 ? 'local_pending' : 'synced';
			isSyncInFlight = false;

			if (remaining > 0 || hasQueuedSyncDuringFlight) {
				hasQueuedSyncDuringFlight = false;
				setTimeout(() => {
					void syncNow({ checkRemoteUpdates: false });
				}, 350);
			}
			return true;
		} catch (err) {
			isSyncInFlight = false;
			const errorInfo = extractApiErrorInfo(err, 'خطای ارتباط با سرور');
			if (errorInfo.statusCode === 401 && navigator.onLine) {
				if (retryTimer) {
					clearTimeout(retryTimer);
					retryTimer = null;
				}
				status.value = 'error';
				lastErrorMessage.value = errorInfo.message;
				await clientAuth.checkAuth(false, true);
				if (!window.location.pathname.startsWith('/login')) {
					await navigateTo({
						path: '/login',
						query: { redirectTo: window.location.pathname + window.location.search }
					});
				}
				return false;
			}
			status.value = navigator.onLine ? 'error' : 'offline';
			lastErrorMessage.value = errorInfo.message;
			scheduleRetry();
			return false;
		}
	}

	function scheduleRetry() {
		if (!isOnline.value) return;
		if (retryTimer) clearTimeout(retryTimer);

		retryAttempt = Math.min(retryAttempt + 1, 5);
		const delayMs = Math.min(30000, 2000 * Math.pow(2, retryAttempt - 1));

		retryTimer = setTimeout(() => {
			retryTimer = null;
			if (isOnline.value && !isSyncInFlight) {
				void syncNow({ checkRemoteUpdates: false });
			}
		}, delayMs);
	}

	async function notifyLocalMutationStaged(): Promise<void> {
		if (!import.meta.client) return;
		await refreshPendingCount();

		if (!navigator.onLine) {
			isOnline.value = false;
			status.value = 'offline';
			return;
		}

		if (status.value !== 'syncing') {
			status.value = 'local_pending';
		}

		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			void syncNow({ checkRemoteUpdates: false });
		}, 350);
	}

	function init() {
		if (!import.meta.client || isInitialized) return;
		isInitialized = true;
		isOnline.value = navigator.onLine;

		if (unsubscribeMutationStaged) {
			unsubscribeMutationStaged();
		}
		unsubscribeMutationStaged = onLocalMutationStaged(() => {
			void notifyLocalMutationStaged();
		});

		window.addEventListener('online', () => {
			isOnline.value = true;
			retryAttempt = 0;
			if (retryTimer) clearTimeout(retryTimer);
			void syncNow({ checkRemoteUpdates: true });
		});

		window.addEventListener('offline', () => {
			isOnline.value = false;
			status.value = 'offline';
			if (retryTimer) clearTimeout(retryTimer);
		});

		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible' && isOnline.value) {
				retryAttempt = 0;
				void syncNow({ checkRemoteUpdates: true });
			}
		});

		window.addEventListener('focus', () => {
			if (isOnline.value) {
				void syncNow({ checkRemoteUpdates: true });
			}
		});

		window.addEventListener('pagehide', () => {
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			if (isOnline.value && pendingCount.value > 0 && !isSyncInFlight) {
				void syncNow({ checkRemoteUpdates: false });
			}
		});

		if (periodicPollTimer) {
			clearInterval(periodicPollTimer);
		}
		periodicPollTimer = setInterval(() => {
			if (document.visibilityState === 'visible' && isOnline.value && !isSyncInFlight) {
				void syncNow({ checkRemoteUpdates: true });
			}
		}, 3 * 60 * 1000);

		void refreshPendingCount().then(() => {
			if (isOnline.value) {
				void syncNow({ checkRemoteUpdates: true });
			}
		});
	}

	function reset() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		isSyncInFlight = false;
		hasQueuedSyncDuringFlight = false;
		retryAttempt = 0;
		pendingCount.value = 0;
		knownServerVersionIso.value = null;
		lastSyncedAtIso.value = null;
		lastErrorMessage.value = null;
		status.value = 'synced';
	}

	return {
		status,
		pendingCount,
		isOnline,
		lastSyncedAtIso,
		knownServerVersionIso,
		lastErrorMessage,
		init,
		reset,
		syncNow,
		notifyLocalMutationStaged,
		refreshPendingCount
	};
}
