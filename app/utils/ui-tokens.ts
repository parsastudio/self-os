import type { TierButtonDescriptor } from '~/domain/schemas';

const TIER_BUTTON_SIZE_CLASSES: Record<TierButtonDescriptor['sizeVariant'], string> = {
	compact: 'sm:px-3',
	narrow: 'sm:min-w-14 sm:px-3.5',
	standard: 'sm:min-w-16 sm:px-3.5'
};

export function resolveTierButtonWidthClass(
	variant: TierButtonDescriptor['sizeVariant']
): string {
	return TIER_BUTTON_SIZE_CLASSES[variant] ?? TIER_BUTTON_SIZE_CLASSES.standard;
}
