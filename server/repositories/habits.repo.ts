import { db } from '../database/index';
import { habitLifecycleEvents, habits } from '../database/schema';
import { eq } from 'drizzle-orm';
import { getTodayIso } from '~/domain/calendar';
import { DEFAULT_HABIT_CATEGORY } from '~/domain/constants';
import type {
	CreateHabitInput,
	HabitEntity,
	LifecycleEventEntity,
	MutateHabitStructureInput
} from '~/domain/schemas';

export function getAllHabits(): HabitEntity[] {
	return db.select().from(habits).orderBy(habits.sortOrder).all();
}

export function createNewHabit(input: CreateHabitInput): HabitEntity {
	const todayIso = getTodayIso();
	const nowIso = new Date().toISOString();
	const existing = getAllHabits();
	const maxOrder = existing.reduce((max, h) => Math.max(max, h.sortOrder), 0);

	const newHabit: HabitEntity = {
		id: crypto.randomUUID(),
		parentId: input.parentId ?? null,
		title: input.title.trim(),
		category: input.category.trim() || DEFAULT_HABIT_CATEGORY,
		trackingMode: input.trackingMode,
		timeSlot: input.timeSlot ?? 'day',
		isSituational: input.isSituational ?? false,
		status: 'active',
		scheduleLabel: input.scheduleLabel?.trim() || null,
		notes: input.notes?.trim() || null,
		bronzeDesc: input.bronzeDesc?.trim() || null,
		silverDesc: input.silverDesc?.trim() || null,
		goldDesc: input.goldDesc?.trim() || null,
		emergencyMinDesc: input.emergencyMinDesc?.trim() || null,
		defaultIntervals: input.defaultIntervals,
		defaultMinutesPerInterval: input.defaultMinutesPerInterval,
		cadenceWindowMinutes: input.cadenceWindowMinutes,
		sortOrder: maxOrder + 1,
		createdAtIso: todayIso,
		updatedAtIso: nowIso
	};

	db.insert(habits).values(newHabit).run();

	db.insert(habitLifecycleEvents)
		.values({
			id: crypto.randomUUID(),
			habitId: newHabit.id,
			habitTitleSnapshot: newHabit.title,
			eventType: newHabit.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
			effectiveDateIso: todayIso,
			summary: newHabit.parentId
				? `ایجاد زیرطرح «${newHabit.title}»`
				: `ایجاد طرح «${newHabit.title}»`,
			reason: input.reason?.trim() || 'تعریف طرح جدید',
			previousStateJson: null,
			newStateJson: JSON.stringify(newHabit),
			createdAtIso: nowIso
		})
		.run();

	return newHabit;
}

export function updateHabitStructure(input: MutateHabitStructureInput): void {
	const current = db.select().from(habits).where(eq(habits.id, input.habitId)).get();
	if (!current) throw new Error('طرح یافت نشد');

	const todayIso = getTodayIso();
	const nowIso = new Date().toISOString();

	let eventType: LifecycleEventEntity['eventType'] = 'UPDATED_RULES';
	let summary = `ویرایش شرایط طرح «${input.title}»`;

	if (current.parentId !== input.parentId) {
		if (input.parentId) {
			eventType = 'CONVERTED_TO_SUBHABIT';
			const parent = db.select().from(habits).where(eq(habits.id, input.parentId)).get();
			summary = `تبدیل «${input.title}» به زیرطرحِ «${parent?.title ?? 'والد'}»`;
		} else {
			eventType = 'PROMOTED_TO_ROOT';
			summary = `تبدیل «${input.title}» به طرح مستقل`;
		}
	} else if (current.status !== input.status) {
		eventType = input.status === 'archived' ? 'DELETED' : 'STATUS_CHANGED';
		summary = `تغییر وضعیت «${input.title}» به ${input.status}`;
	}

	db.update(habits)
		.set({
			title: input.title,
			category: input.category.trim() || current.category,
			parentId: input.parentId,
			timeSlot: input.timeSlot ?? current.timeSlot,
			isSituational: input.isSituational,
			status: input.status,
			scheduleLabel: input.scheduleLabel,
			notes: input.notes,
			bronzeDesc: input.bronzeDesc,
			silverDesc: input.silverDesc,
			goldDesc: input.goldDesc,
			emergencyMinDesc: input.emergencyMinDesc,
			updatedAtIso: nowIso
		})
		.where(eq(habits.id, input.habitId))
		.run();

	db.insert(habitLifecycleEvents)
		.values({
			id: crypto.randomUUID(),
			habitId: input.habitId,
			habitTitleSnapshot: input.title,
			eventType,
			effectiveDateIso: todayIso,
			summary,
			reason: input.reason,
			previousStateJson: JSON.stringify(current),
			newStateJson: JSON.stringify(input),
			createdAtIso: nowIso
		})
		.run();
}
