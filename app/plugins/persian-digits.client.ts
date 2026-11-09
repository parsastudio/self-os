import { toPersianDigits } from '~/domain/calendar';

const handlerMap = new WeakMap<
	HTMLElement,
	{
		onInput: (e: Event) => void;
		onCompositionEnd: () => void;
	}
>();

export default defineNuxtPlugin((nuxtApp) => {
	nuxtApp.vueApp.directive('persian-digits', {
		mounted(el: HTMLInputElement | HTMLTextAreaElement) {
			const normalizeElementValue = () => {
				const start = el.selectionStart;
				const end = el.selectionEnd;
				const original = el.value;
				const converted = toPersianDigits(original);

				if (original !== converted) {
					el.value = converted;
					if (start !== null && end !== null) {
						el.setSelectionRange(start, end);
					}
				}
			};

			const onInput = (e: Event) => {
				if ((e as InputEvent).isComposing) return;
				normalizeElementValue();
			};

			const onCompositionEnd = () => {
				normalizeElementValue();
			};

			handlerMap.set(el, { onInput, onCompositionEnd });
			el.addEventListener('input', onInput, { capture: true });
			el.addEventListener('compositionend', onCompositionEnd, { capture: true });
		},
		unmounted(el: HTMLInputElement | HTMLTextAreaElement) {
			const handlers = handlerMap.get(el);
			if (handlers) {
				el.removeEventListener('input', handlers.onInput, { capture: true });
				el.removeEventListener('compositionend', handlers.onCompositionEnd, { capture: true });
				handlerMap.delete(el);
			}
		}
	});
});
