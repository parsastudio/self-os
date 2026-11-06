import { ref } from 'vue';

function getInitialDarkState(): boolean {
	if (!import.meta.client) return true;
	try {
		const stored = localStorage.getItem('newlife_theme');
		if (stored === 'light') return false;
		if (stored === 'dark') return true;
	} catch {
		// ignore storage access errors
	}
	return true;
}

const isDark = ref(getInitialDarkState());

export function useTheme() {
	function applyToDom() {
		if (!import.meta.client) return;
		const root = document.documentElement;
		root.classList.toggle('dark', isDark.value);
		root.style.colorScheme = isDark.value ? 'dark' : 'light';
	}

	function init() {
		if (!import.meta.client) return;
		isDark.value = getInitialDarkState();
		applyToDom();
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
			try {
				localStorage.setItem('newlife_theme', isDark.value ? 'dark' : 'light');
			} catch {
				// ignore quota errors
			}
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
