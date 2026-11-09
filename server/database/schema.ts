import {
	boolean,
	doublePrecision,
	index,
	integer,
	pgTable,
	text,
	uniqueIndex
} from 'drizzle-orm/pg-core';

export const habits = pgTable(
	'habits',
	{
		id: text('id').primaryKey(),
		parentId: text('parent_id'),
		title: text('title').notNull(),
		category: text('category').notNull().default('عمومی'),
		trackingMode: text('tracking_mode', { enum: ['tiered', 'interval_cadence'] })
			.notNull()
			.default('tiered'),
		timeSlot: text('time_slot', { enum: ['morning', 'day', 'night'] })
			.notNull()
			.default('day'),
		isSituational: boolean('is_situational').notNull().default(false),
		status: text('status', { enum: ['active', 'paused', 'archived'] })
			.notNull()
			.default('active'),
		scheduleLabel: text('schedule_label'),
		notes: text('notes'),
		bronzeDesc: text('bronze_desc'),
		silverDesc: text('silver_desc'),
		goldDesc: text('gold_desc'),
		emergencyMinDesc: text('emergency_min_desc'),
		defaultIntervals: integer('default_intervals').notNull().default(2),
		defaultMinutesPerInterval: doublePrecision('default_minutes_per_interval')
			.notNull()
			.default(10),
		cadenceWindowMinutes: integer('cadence_window_minutes').notNull().default(60),
		sortOrder: integer('sort_order').notNull().default(0),
		createdAtIso: text('created_at_iso').notNull(),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		index('idx_habits_parent_id').on(t.parentId),
		index('idx_habits_updated_at').on(t.updatedAtIso)
	]
);

export const cadencePlans = pgTable(
	'cadence_plans',
	{
		id: text('id').primaryKey(),
		dateIso: text('date_iso').notNull(),
		habitId: text('habit_id').notNull(),
		plannedIntervals: integer('planned_intervals').notNull(),
		plannedMinutesPerInterval: doublePrecision('planned_minutes_per_interval').notNull(),
		cadenceWindowMinutes: integer('cadence_window_minutes').notNull().default(60),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		uniqueIndex('idx_cadence_plans_date_habit').on(t.dateIso, t.habitId),
		index('idx_cadence_plans_updated_at').on(t.updatedAtIso)
	]
);

export const dailyEntries = pgTable(
	'daily_entries',
	{
		id: text('id').primaryKey(),
		dateIso: text('date_iso').notNull().unique(),
		dayStatus: text('day_status', { enum: ['optimal', 'partial', 'failed'] })
			.notNull()
			.default('optimal'),
		reflectionNote: text('reflection_note').notNull().default(''),
		journalText: text('journal_text'),
		tagsJson: text('tags_json').notNull().default('[]'),
		updatedAtIso: text('updated_at_iso').notNull()
	},
	(t) => [index('idx_daily_entries_updated_at').on(t.updatedAtIso)]
);

export const habitLogs = pgTable(
	'habit_logs',
	{
		id: text('id').primaryKey(),
		dateIso: text('date_iso').notNull(),
		habitId: text('habit_id').notNull(),
		habitTitleSnapshot: text('habit_title_snapshot'),
		achievedTier: integer('achieved_tier'),
		achievedRuleSnapshot: text('achieved_rule_snapshot'),
		habitSnapshotJson: text('habit_snapshot_json'),
		completedIntervals: integer('completed_intervals'),
		actualMinutesPerInterval: doublePrecision('actual_minutes_per_interval'),
		totalActualMinutes: doublePrecision('total_actual_minutes'),
		plannedIntervalsSnapshot: integer('planned_intervals_snapshot'),
		plannedMinutesSnapshot: doublePrecision('planned_minutes_snapshot'),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		index('idx_habit_logs_date_iso').on(t.dateIso),
		uniqueIndex('idx_habit_logs_date_habit').on(t.dateIso, t.habitId),
		index('idx_habit_logs_updated_at').on(t.updatedAtIso)
	]
);

export const habitLifecycleEvents = pgTable(
	'habit_lifecycle_events',
	{
		id: text('id').primaryKey(),
		habitId: text('habit_id'),
		habitTitleSnapshot: text('habit_title_snapshot').notNull(),
		eventType: text('event_type', {
			enum: [
				'CREATED',
				'UPDATED_RULES',
				'CONVERTED_TO_SUBHABIT',
				'PROMOTED_TO_ROOT',
				'CADENCE_UPDATED',
				'STATUS_CHANGED',
				'DELETED'
			]
		}).notNull(),
		effectiveDateIso: text('effective_date_iso').notNull(),
		summary: text('summary').notNull(),
		reason: text('reason'),
		previousStateJson: text('previous_state_json'),
		newStateJson: text('new_state_json'),
		createdAtIso: text('created_at_iso').notNull()
	},
	(t) => [index('idx_lifecycle_events_habit_id').on(t.habitId)]
);

export const reflectionTags = pgTable('reflection_tags', {
	id: text('id').primaryKey(),
	label: text('label').notNull().unique(),
	sortOrder: integer('sort_order').notNull().default(0)
});

export const books = pgTable(
	'books',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		author: text('author'),
		status: text('status', { enum: ['reading', 'completed', 'on_hold'] })
			.notNull()
			.default('completed'),
		startedAtIso: text('started_at_iso'),
		finishedAtIso: text('finished_at_iso'),
		rating: integer('rating').default(5),
		notes: text('notes'),
		createdAtIso: text('created_at_iso').notNull(),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		index('idx_books_updated_at').on(t.updatedAtIso),
		index('idx_books_dates').on(t.startedAtIso, t.finishedAtIso)
	]
);

export const mediaLogs = pgTable(
	'media_logs',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		category: text('category', { enum: ['movie', 'series', 'anime', 'animation'] })
			.notNull()
			.default('movie'),
		status: text('status', { enum: ['completed', 'on_hold'] })
			.notNull()
			.default('completed'),
		startedAtIso: text('started_at_iso'),
		finishedAtIso: text('finished_at_iso'),
		rating: integer('rating').default(5),
		notes: text('notes'),
		createdAtIso: text('created_at_iso').notNull(),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		index('idx_media_logs_updated_at').on(t.updatedAtIso),
		index('idx_media_logs_dates').on(t.startedAtIso, t.finishedAtIso)
	]
);

export const calendarEvents = pgTable(
	'calendar_events',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull(),
		eventType: text('event_type', {
			enum: ['birthday', 'deadline', 'occasion', 'reminder']
		})
			.notNull()
			.default('occasion'),
		isAnnual: boolean('is_annual').notNull().default(false),
		dateIso: text('date_iso'),
		jalaliMonth: integer('jalali_month').notNull(),
		jalaliDay: integer('jalali_day').notNull(),
		isCompleted: boolean('is_completed').notNull().default(false),
		notes: text('notes'),
		createdAtIso: text('created_at_iso').notNull(),
		updatedAtIso: text('updated_at_iso')
	},
	(t) => [
		index('idx_calendar_events_updated_at').on(t.updatedAtIso),
		index('idx_calendar_events_date').on(t.dateIso),
		index('idx_calendar_events_jalali').on(t.jalaliMonth, t.jalaliDay)
	]
);

export const notes = pgTable(
	'notes',
	{
		id: text('id').primaryKey(),
		title: text('title').notNull().default(''),
		content: text('content').notNull(),
		category: text('category').notNull().default('عمومی'),
		isPinned: boolean('is_pinned').notNull().default(false),
		createdAtIso: text('created_at_iso').notNull(),
		updatedAtIso: text('updated_at_iso').notNull()
	},
	(t) => [index('idx_notes_updated_at').on(t.updatedAtIso)]
);

export const appAuth = pgTable('app_auth', {
	id: text('id').primaryKey(),
	passwordHash: text('password_hash').notNull(),
	passwordSalt: text('password_salt').notNull(),
	updatedAtIso: text('updated_at_iso').notNull()
});

export const authSessions = pgTable(
	'auth_sessions',
	{
		id: text('id').primaryKey(),
		createdAtIso: text('created_at_iso').notNull(),
		expiresAtIso: text('expires_at_iso').notNull(),
		lastSeenAtIso: text('last_seen_at_iso').notNull()
	},
	(t) => [index('idx_auth_sessions_expires_at').on(t.expiresAtIso)]
);

export const syncState = pgTable('sync_state', {
	id: text('id').primaryKey(),
	structuralVersionIso: text('structural_version_iso').notNull()
});
