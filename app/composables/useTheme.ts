import { getAppDatabase } from '~/composables/useAppDatabase';

const isDark = ref(true);

async function loadThemeFromDb(): Promise<boolean> {
	try {
		const db = getAppDatabase();
		const record = await db.syncMeta.get('meta:theme');
		if (record?.themeMode === 'light') return false;
		if (record?.themeMode === 'dark') return true;
	} catch {
		// ignore db access errors
	}
	return true;
}

async function persistThemeToDb(dark: boolean): Promise<void> {
	try {
		const db = getAppDatabase();
		await db.syncMeta.put({
			key: 'meta:theme',
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
		const root = document.documentElement;
		root.classList.toggle('dark', isDark.value);
		root.style.colorScheme = isDark.value ? 'dark' : 'light';
		const themeMeta = document.querySelector('meta[name="theme-color"]');
		if (themeMeta) {
			themeMeta.setAttribute('content', isDark.value ? '#0f131a' : '#f1ede4');
		}
	}

	function init() {
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
