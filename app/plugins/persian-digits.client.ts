import { toPersianDigits } from '~/domain/calendar';

export default defineNuxtPlugin((nuxtApp) => {
	nuxtApp.vueApp.directive('persian-digits', {
		mounted(el: HTMLInputElement | HTMLTextAreaElement) {
			const handleInput = () => {
				const start = el.selectionStart;
				const end = el.selectionEnd;
				const original = el.value;
				const converted = toPersianDigits(original);

				if (original !== converted) {
					el.value = converted;
					if (start !== null && end !== null) {
						el.setSelectionRange(start, end);
					}
					el.dispatchEvent(new Event('input', { bubbles: true }));
				}
			};

			(el as unknown as Record<string, unknown>)._persianHandler = handleInput;
			el.addEventListener('input', handleInput);
		},
		unmounted(el: HTMLInputElement | HTMLTextAreaElement) {
			const handler = (el as unknown as Record<string, unknown>)._persianHandler as ((e: Event) => void) | undefined;
			if (handler) {
				el.removeEventListener('input', handler);
			}
		}
	});
});
