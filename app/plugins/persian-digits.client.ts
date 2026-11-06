import { toPersianDigits } from '~/domain/calendar';

const handlerMap = new WeakMap<HTMLElement, () => void>();

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

			handlerMap.set(el, handleInput);
			el.addEventListener('input', handleInput);
		},
		unmounted(el: HTMLInputElement | HTMLTextAreaElement) {
			const handler = handlerMap.get(el);
			if (handler) {
				el.removeEventListener('input', handler);
				handlerMap.delete(el);
			}
		}
	});
});
