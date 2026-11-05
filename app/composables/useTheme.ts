import { ref } from 'vue';

const isDark = ref(true);

export function useTheme() {
	function init() {
		if (!import.meta.client) return;
		const root = document.documentElement;
		const stored = localStorage.getItem('newlife_theme');
		if (stored === 'light' || stored === 'dark') {
			isDark.value = stored === 'dark';
		} else {
			isDark.value = root.classList.contains('dark');
		}
		applyToDom();
	}

	function toggle() {
		const nextState = !isDark.value;
		if (!import.meta.client) {
			isDark.value = nextState;
			return;
		}

		const applyChange = () => {
			isDark.value = nextState;
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

	function applyToDom() {
		if (!import.meta.client) return;
		const root = document.documentElement;
		root.classList.toggle('dark', isDark.value);
		root.style.colorScheme = isDark.value ? 'dark' : 'light';
	}

	return {
		isDark,
		init,
		toggle
	};
}
