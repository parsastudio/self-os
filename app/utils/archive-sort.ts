export type ArchiveSortableItem = {
	title: string;
	rating: number | null;
	startedAtIso?: string | null;
	finishedAtIso: string | null;
	createdAtIso: string;
};

export function sortArchiveItems<T extends ArchiveSortableItem>(
	items: ReadonlyArray<T>,
	sortBy: 'rating_desc' | 'newest' | 'oldest' | 'title_asc'
): T[] {
	return [...items].sort((a, b) => {
		if (sortBy === 'rating_desc') {
			const rDiff = (b.rating ?? 0) - (a.rating ?? 0);
			if (rDiff !== 0) return rDiff;
			return b.createdAtIso > a.createdAtIso ? 1 : b.createdAtIso < a.createdAtIso ? -1 : 0;
		}
		if (sortBy === 'newest') {
			const dateA = a.finishedAtIso || a.startedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.startedAtIso || b.createdAtIso;
			return dateB > dateA ? 1 : dateB < dateA ? -1 : 0;
		}
		if (sortBy === 'oldest') {
			const dateA = a.finishedAtIso || a.startedAtIso || a.createdAtIso;
			const dateB = b.finishedAtIso || b.startedAtIso || b.createdAtIso;
			return dateA > dateB ? 1 : dateA < dateB ? -1 : 0;
		}
		return a.title.localeCompare(b.title, 'fa');
	});
}
