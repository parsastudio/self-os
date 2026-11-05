import { db } from '../database/index';
import { calendarEvents } from '../database/schema';
import { desc, eq } from 'drizzle-orm';
import { getTodayIso, isoToJalaliParts } from '~/domain/calendar';
import { computeUpcomingEventsBanner } from '~/core/calendar-engine';
import type {
	CalendarEventEntity,
	CreateCalendarEventInput,
	UpcomingEventBannerItem
} from '~/domain/schemas';

export function createCalendarEvent(input: CreateCalendarEventInput): CalendarEventEntity {
	const parts = isoToJalaliParts(input.dateIso);
	const isAnnual = Boolean(input.isAnnual);
	const nowIso = new Date().toISOString();

	const newEvent: CalendarEventEntity = {
		id: crypto.randomUUID(),
		title: input.title.trim(),
		eventType: input.eventType,
		isAnnual,
		dateIso: isAnnual ? null : input.dateIso,
		jalaliMonth: parts.jm,
		jalaliDay: parts.jd,
		isCompleted: false,
		notes: input.notes?.trim() || null,
		createdAtIso: nowIso,
		updatedAtIso: nowIso
	};

	db.insert(calendarEvents).values(newEvent).run();
	return newEvent;
}

export function toggleCalendarEventCompletion(eventId: string, isCompleted: boolean): void {
	const nowIso = new Date().toISOString();
	db.update(calendarEvents)
		.set({ isCompleted, updatedAtIso: nowIso })
		.where(eq(calendarEvents.id, eventId))
		.run();
}

export function deleteCalendarEvent(eventId: string): void {
	db.delete(calendarEvents).where(eq(calendarEvents.id, eventId)).run();
}

export function getUpcomingEventsBannerItems(
	referenceDateIso: string,
	horizonDays = 7
): {
	todayAndUpcoming: UpcomingEventBannerItem[];
	selectedDayEvents: CalendarEventEntity[];
} {
	const todayIso = getTodayIso();
	const allEvents = db
		.select()
		.from(calendarEvents)
		.orderBy(desc(calendarEvents.createdAtIso))
		.all();

	return computeUpcomingEventsBanner({
		allEvents,
		referenceDateIso,
		todayIso,
		horizonDays
	});
}
