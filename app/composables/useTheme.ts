import { getAppDatabase } from '~/composables/useAppDatabase';

const isDark = ref(true);

async function loadThemeFromDb(): Promise<boolean> {
	if (!import.meta.client) return true;
	try {
		const db = getAppDatabase();
		if (!db) return true;
		const record = await db.syncMeta.get('meta:theme');
		if (record?.themeMode === 'light') return false;
		if (record?.themeMode === 'dark') return true;
	} catch {
		// ignore db access errors
	}
	return true;
}

async function persistThemeToDb(dark: boolean): Promise<void> {
	if (!import.meta.client) return;
	try {
		const db = getAppDatabase();
		if (!db) return;
		await db.syncMeta.put({
			key: 'meta:theme',
			clientId: '',
			knownServerVersionIso: null,
			lastSyncedAtIso: null,
			themeMode: dark ? 'dark' : 'light'
		});
	} catch {
		// ignore db write errors
	}
}

export function useTheme() {
	function applyToDom() {
		if (!import.meta.client) return;
		const root = document.documentElement;
		root.classList.toggle('dark', isDark.value);
		root.style.colorScheme = isDark.value ? 'dark' : 'light';
	}

	function init() {
		if (!import.meta.client) return;
		applyToDom();
		void loadThemeFromDb().then((storedDark) => {
			isDark.value = storedDark;
			applyToDom();
		});
	}

	function setTheme(dark: boolean) {
		if (isDark.value === dark) {
			applyToDom();
			return;
		}
		if (!import.meta.client) {
			isDark.value = dark;
			return;
		}

		const applyChange = () => {
			isDark.value = dark;
			void persistThemeToDb(isDark.value);
			applyToDom();
		};

		const docWithTransition = document as Document & {
			startViewTransition?: (callback: () => void) => void;
		};

		if (typeof docWithTransition.startViewTransition === 'function') {
			docWithTransition.startViewTransition(() => {
				applyChange();
			});
		} else {
			applyChange();
		}
	}

	return {
		isDark,
		init,
		setTheme
	};
}
