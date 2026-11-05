import type Database from 'better-sqlite3';
import crypto from 'node:crypto';
import {
	getDaysUntilIso,
	isoToJalaliSlash,
	jalaliSlashToIso,
	shiftIsoDate
} from '~/domain/calendar';
import { TIER_SCORES } from '~/domain/constants';
import type { HabitEntity, HabitLogItemInput } from '~/domain/schemas';
import {
	evaluateDayStatusColor,
	resolveHabitRuleSnapshot,
	serializeHabitSpecSnapshot
} from '~/core/habit-engine';
import {
	SEED_BOOKS_ORDER,
	SEED_DAILY_ROWS,
	SEED_HABITS,
	SEED_REFLECTION_TAGS,
	type RawDailySheetRow
} from './seed-data';

function requireIsoFromJalali(jalaliSlash: string): string {
	const iso = jalaliSlashToIso(jalaliSlash);
	if (!iso) {
		throw new Error(`Invalid Jalali date encountered during seed: ${jalaliSlash}`);
	}
	return iso;
}

function mapRawCellToTier(raw: number | '-' | undefined): number | null {
	if (raw === undefined) return null;
	if (raw === '-') return TIER_SCORES.SKIPPED;
	return raw;
}

export function seedDatabaseWithInitialData(
	client: Database.Database,
	options: { wipeExisting: boolean }
): void {
	const nowIso = new Date().toISOString();

	if (options.wipeExisting) {
		client.exec(`
			DELETE FROM habit_logs;
			DELETE FROM daily_entries;
			DELETE FROM cadence_plans;
			DELETE FROM habit_lifecycle_events;
			DELETE FROM reflection_tags;
			DELETE FROM habits;
			DELETE FROM books;
		`);
	}

	const habitEntities: HabitEntity[] = SEED_HABITS.map((def) => {
		const createdAtIso = requireIsoFromJalali(def.createdAtJalali);
		return {
			id: def.id,
			parentId: def.parentId,
			title: def.title,
			category: def.category,
			trackingMode: def.trackingMode,
			timeSlot: def.timeSlot,
			isSituational: def.isSituational,
			status: 'active',
			scheduleLabel: def.scheduleLabel,
			notes: def.notes,
			bronzeDesc: def.bronzeDesc,
			silverDesc: def.silverDesc,
			goldDesc: def.goldDesc,
			emergencyMinDesc: def.emergencyMinDesc,
			defaultIntervals: 1,
			defaultMinutesPerInterval: 0,
			cadenceWindowMinutes: 60,
			sortOrder: def.sortOrder,
			createdAtIso,
			updatedAtIso: nowIso
		};
	});

	const habitById = new Map(habitEntities.map((h) => [h.id, h]));

	const insertHabitStmt = client.prepare(`
		INSERT OR IGNORE INTO habits (
			id, parent_id, title, category, tracking_mode, time_slot, is_situational, status,
			schedule_label, notes, bronze_desc, silver_desc, gold_desc,
			emergency_min_desc, default_intervals, default_minutes_per_interval,
			cadence_window_minutes, sort_order, created_at_iso, updated_at_iso
		) VALUES (
			@id, @parentId, @title, @category, @trackingMode, @timeSlot, @isSituational, @status,
			@scheduleLabel, @notes, @bronzeDesc, @silverDesc, @goldDesc,
			@emergencyMinDesc, @defaultIntervals, @defaultMinutesPerInterval,
			@cadenceWindowMinutes, @sortOrder, @createdAtIso, @updatedAtIso
		)
	`);

	const insertLifecycleStmt = client.prepare(`
		INSERT OR IGNORE INTO habit_lifecycle_events (
			id, habit_id, habit_title_snapshot, event_type,
			effective_date_iso, summary, reason, previous_state_json,
			new_state_json, created_at_iso
		) VALUES (
			@id, @habitId, @habitTitleSnapshot, @eventType,
			@effectiveDateIso, @summary, @reason, @previousStateJson,
			@newStateJson, @createdAtIso
		)
	`);

	const insertTagStmt = client.prepare(`
		INSERT OR IGNORE INTO reflection_tags (id, label, sort_order)
		VALUES (@id, @label, @sortOrder)
	`);

	const insertEntryStmt = client.prepare(`
		INSERT OR IGNORE INTO daily_entries (
			id, date_iso, day_status, reflection_note, journal_text, tags_json, updated_at_iso
		) VALUES (
			@id, @dateIso, @dayStatus, @reflectionNote, @journalText, @tagsJson, @updatedAtIso
		)
	`);

	const insertLogStmt = client.prepare(`
		INSERT OR IGNORE INTO habit_logs (
			id, date_iso, habit_id, habit_title_snapshot, achieved_tier,
			achieved_rule_snapshot, habit_snapshot_json, completed_intervals,
			actual_minutes_per_interval, total_actual_minutes,
			planned_intervals_snapshot, planned_minutes_snapshot, updated_at_iso
		) VALUES (
			@id, @dateIso, @habitId, @habitTitleSnapshot, @achievedTier,
			@achievedRuleSnapshot, @habitSnapshotJson, @completedIntervals,
			@actualMinutesPerInterval, @totalActualMinutes,
			@plannedIntervalsSnapshot, @plannedMinutesSnapshot, @updatedAtIso
		)
	`);

	const insertBookStmt = client.prepare(`
		INSERT OR IGNORE INTO books (
			id, title, author, status, started_at_iso, finished_at_iso,
			rating, notes, created_at_iso, updated_at_iso
		) VALUES (
			@id, @title, @author, @status, @startedAtIso, @finishedAtIso,
			@rating, @notes, @createdAtIso, @updatedAtIso
		)
	`);

	function buildLogForHabitOnDay(
		habitId: string,
		dateIso: string,
		rawValue: number | '-' | undefined
	): HabitLogItemInput | null {
		const achievedTier = mapRawCellToTier(rawValue);
		if (achievedTier === null) return null;

		const habit = habitById.get(habitId);
		if (!habit) return null;

		return {
			habitId: habit.id,
			habitTitleSnapshot: habit.title,
			achievedTier,
			achievedRuleSnapshot: resolveHabitRuleSnapshot(habit, achievedTier),
			completedIntervals: null,
			actualMinutesPerInterval: null,
			totalActualMinutes: null,
			plannedIntervalsSnapshot: null,
			plannedMinutesSnapshot: null,
			updatedAtIso: `${dateIso}T20:00:00.000Z`
		};
	}

	function extractDayLogs(row: RawDailySheetRow, dateIso: string): HabitLogItemInput[] {
		const logs: HabitLogItemInput[] = [];

		const pushIfPresent = (habitId: string, val: number | '-' | undefined) => {
			const item = buildLogForHabitOnDay(habitId, dateIso, val);
			if (item) logs.push(item);
		};

		pushIfPresent('habit-morning-worship', row.scores.morningWorship);
		pushIfPresent('habit-toothbrushing', row.scores.toothbrushing);

		if (row.scores.prayersGroup !== undefined) {
			pushIfPresent('habit-prayers-group', row.scores.prayersGroup);
			pushIfPresent('habit-sub-quran', row.scores.prayersGroup);
			pushIfPresent('habit-sub-nahj', row.scores.prayersGroup);
			pushIfPresent('habit-sub-sahifa', row.scores.prayersGroup);
		}

		pushIfPresent('habit-book', row.scores.bookReading);
		pushIfPresent('habit-study', row.scores.studying);
		pushIfPresent('habit-abstinence', row.scores.abstinence);
		pushIfPresent('habit-work-life', row.scores.workLife);
		pushIfPresent('habit-language', row.scores.languageLearning);

		return logs;
	}

	const firstRow = SEED_DAILY_ROWS[0];
	const lastRow = SEED_DAILY_ROWS[SEED_DAILY_ROWS.length - 1];
	if (!firstRow || !lastRow) return;

	const firstSheetDateIso = requireIsoFromJalali(firstRow.jalaliDate);
	const lastSheetDateIso = requireIsoFromJalali(lastRow.jalaliDate);
	const totalDaysSpan = Math.max(1, getDaysUntilIso(firstSheetDateIso, lastSheetDateIso));

	const runTx = client.transaction(() => {
		for (const h of habitEntities) {
			insertHabitStmt.run({
				...h,
				isSituational: h.isSituational ? 1 : 0
			});

			insertLifecycleStmt.run({
				id: crypto.randomUUID(),
				habitId: h.id,
				habitTitleSnapshot: h.title,
				eventType: h.parentId ? 'CONVERTED_TO_SUBHABIT' : 'CREATED',
				effectiveDateIso: h.createdAtIso,
				summary: h.parentId
					? `ثبت زیرطرح «${h.title}» در مجموعه ادعیه (${isoToJalaliSlash(h.createdAtIso)})`
					: `شروع ردیابی طرح «${h.title}» از تاریخ ${isoToJalaliSlash(h.createdAtIso)}`,
				reason: 'ثبت در جدول اصلی ردیابی طرح‌ها',
				previousStateJson: null,
				newStateJson: JSON.stringify(h),
				createdAtIso: `${h.createdAtIso}T08:00:00.000Z`
			});
		}

		SEED_REFLECTION_TAGS.forEach((label, idx) => {
			insertTagStmt.run({
				id: `tag-${idx + 1}`,
				label,
				sortOrder: idx + 1
			});
		});

		for (const row of SEED_DAILY_ROWS) {
			const dateIso = requireIsoFromJalali(row.jalaliDate);
			const dayLogs = extractDayLogs(row, dateIso);

			const applicableHabitsOnDate = habitEntities.filter(
				(h) => h.createdAtIso <= dateIso
			);
			const computedDayStatus = evaluateDayStatusColor(applicableHabitsOnDate, dayLogs);
			const entryUpdatedAtIso = `${dateIso}T21:00:00.000Z`;

			insertEntryStmt.run({
				id: `entry:${dateIso}`,
				dateIso,
				dayStatus: computedDayStatus,
				reflectionNote: '',
				journalText: null,
				tagsJson: '[]',
				updatedAtIso: entryUpdatedAtIso
			});

			for (const log of dayLogs) {
				const habit = habitById.get(log.habitId);
				if (!habit) continue;

				insertLogStmt.run({
					id: `log:${dateIso}:${log.habitId}`,
					dateIso,
					habitId: log.habitId,
					habitTitleSnapshot: log.habitTitleSnapshot,
					achievedTier: log.achievedTier,
					achievedRuleSnapshot: log.achievedRuleSnapshot,
					habitSnapshotJson: serializeHabitSpecSnapshot(habit),
					completedIntervals: log.completedIntervals,
					actualMinutesPerInterval: log.actualMinutesPerInterval,
					totalActualMinutes: log.totalActualMinutes,
					plannedIntervalsSnapshot: log.plannedIntervalsSnapshot,
					plannedMinutesSnapshot: log.plannedMinutesSnapshot,
					updatedAtIso: log.updatedAtIso
				});
			}
		}

		const totalBooks = SEED_BOOKS_ORDER.length;
		const intervalDays = Math.max(5, Math.floor(totalDaysSpan / totalBooks));

		SEED_BOOKS_ORDER.forEach((bookItem, idx) => {
			const startOffset = idx * intervalDays;
			const finishOffset = Math.min(totalDaysSpan, startOffset + intervalDays - 1);

			const startedAtIso = shiftIsoDate(firstSheetDateIso, startOffset);
			const finishedAtIso = shiftIsoDate(firstSheetDateIso, finishOffset);
			const createdAtIso = `${finishedAtIso}T18:30:00.000Z`;

			insertBookStmt.run({
				id: `book-1405-${String(idx + 1).padStart(2, '0')}`,
				title: bookItem.title,
				author: bookItem.author,
				status: 'completed',
				startedAtIso,
				finishedAtIso,
				rating: 5,
				notes: bookItem.notes,
				createdAtIso,
				updatedAtIso: createdAtIso
			});
		});
	});

	runTx();
}
