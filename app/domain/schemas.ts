import { z } from 'zod';
import {
	CADENCE_DEFAULTS,
	DEFAULT_HABIT_CATEGORY,
	TIER_SCORES
} from './constants';

export const TrackingModeSchema = z.enum(['tiered', 'interval_cadence']);
export type TrackingMode = z.infer<typeof TrackingModeSchema>;

export const AnalyticsTimeRangeSchema = z.enum(['7d', '30d', '90d', 'all']);
export type AnalyticsTimeRange = z.infer<typeof AnalyticsTimeRangeSchema>;

export const HabitStatusSchema = z.enum(['active', 'paused', 'archived']);
export type HabitStatus = z.infer<typeof HabitStatusSchema>;

export const DayStatusColorSchema = z.enum(['optimal', 'partial', 'failed']);
export type DayStatusColor = z.infer<typeof DayStatusColorSchema>;

export const LifecycleEventTypeSchema = z.enum([
	'CREATED',
	'UPDATED_RULES',
	'CONVERTED_TO_SUBHABIT',
	'PROMOTED_TO_ROOT',
	'CADENCE_UPDATED',
	'STATUS_CHANGED',
	'DELETED'
]);
export type LifecycleEventType = z.infer<typeof LifecycleEventTypeSchema>;

export const BookStatusSchema = z.enum(['reading', 'completed', 'on_hold']);
export type BookStatus = z.infer<typeof BookStatusSchema>;

export const MediaCategorySchema = z.enum(['movie', 'series', 'anime', 'animation']);
export type MediaCategory = z.infer<typeof MediaCategorySchema>;

export const MediaStatusSchema = z.enum(['completed', 'on_hold']);
export type MediaStatus = z.infer<typeof MediaStatusSchema>;

export const MediaStatusFilterSchema = z.enum(['ALL', 'UNSEEN', 'SEEN']);
export type MediaStatusFilter = z.infer<typeof MediaStatusFilterSchema>;

export const MediaSortBySchema = z.enum(['rating_desc', 'newest', 'oldest', 'title_asc']);
export type MediaSortBy = z.infer<typeof MediaSortBySchema>;

export const NoteSmartFilterSchema = z.enum(['ALL', 'HAS_LINK', 'HAS_NUMBER']);
export type NoteSmartFilter = z.infer<typeof NoteSmartFilterSchema>;

export const HabitTimeSlotSchema = z.enum(['morning', 'day', 'night']);
export type HabitTimeSlot = z.infer<typeof HabitTimeSlotSchema>;

export const CalendarEventTypeSchema = z.enum([
	'birthday',
	'deadline',
	'occasion',
	'reminder'
]);
export type CalendarEventType = z.infer<typeof CalendarEventTypeSchema>;

export const HabitEntitySchema = z.object({
	id: z.string(),
	parentId: z.string().nullable(),
	title: z.string().min(1),
	category: z.string().default(DEFAULT_HABIT_CATEGORY),
	trackingMode: TrackingModeSchema,
	timeSlot: HabitTimeSlotSchema.default('day'),
	isSituational: z.boolean().default(false),
	status: HabitStatusSchema,
	scheduleLabel: z.string().nullable(),
	notes: z.string().nullable(),
	bronzeDesc: z.string().nullable(),
	silverDesc: z.string().nullable(),
	goldDesc: z.string().nullable(),
	emergencyMinDesc: z.string().nullable(),
	defaultIntervals: z.number().int().min(0),
	defaultMinutesPerInterval: z.number().min(0),
	cadenceWindowMinutes: z.number().int().min(CADENCE_DEFAULTS.MIN_WINDOW_MINUTES),
	sortOrder: z.number().int().default(0),
	createdAtIso: z.string(),
	updatedAtIso: z.string().nullable().optional()
});
export type HabitEntity = z.infer<typeof HabitEntitySchema>;

export const HabitTreeNodeSchema = HabitEntitySchema.extend({
	children: z.array(HabitEntitySchema),
	timeSlot: HabitTimeSlotSchema
});
export type HabitTreeNode = z.infer<typeof HabitTreeNodeSchema>;

export const CadencePlanEntitySchema = z.object({
	id: z.string(),
	dateIso: z.string(),
	habitId: z.string(),
	plannedIntervals: z.number().int().min(0),
	plannedMinutesPerInterval: z.number().min(0),
	cadenceWindowMinutes: z.number().int().min(15),
	updatedAtIso: z.string().nullable().optional()
});
export type CadencePlanEntity = z.infer<typeof CadencePlanEntitySchema>;

export const HabitLogItemInputSchema = z.object({
	habitId: z.string(),
	habitTitleSnapshot: z.string().nullable().optional(),
	achievedTier: z
		.number()
		.int()
		.min(TIER_SCORES.SKIPPED)
		.max(TIER_SCORES.GOLD)
		.nullable(),
	achievedRuleSnapshot: z.string().nullable().optional(),
	habitSnapshotJson: z.string().nullable().optional(),
	completedIntervals: z.number().int().min(0).nullable(),
	actualMinutesPerInterval: z.number().min(0).nullable(),
	totalActualMinutes: z.number().min(0).nullable(),
	plannedIntervalsSnapshot: z.number().int().min(0).nullable(),
	plannedMinutesSnapshot: z.number().min(0).nullable(),
	updatedAtIso: z.string().nullable().optional()
});
export type HabitLogItemInput = z.infer<typeof HabitLogItemInputSchema>;

export const SaveDailyEntryInputSchema = z.object({
	dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	dayStatus: DayStatusColorSchema,
	reflectionNote: z.string().default(''),
	journalText: z.string().nullable().optional(),
	tags: z.array(z.string()).default([]),
	updatedAtIso: z.string().optional(),
	logs: z.array(HabitLogItemInputSchema)
});
export type SaveDailyEntryInput = z.infer<typeof SaveDailyEntryInputSchema>;

export const SaveCadencePlanBatchSchema = z.object({
	targetDateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	reason: z.string().optional(),
	items: z.array(
		z.object({
			habitId: z.string(),
			plannedIntervals: z.number().int().min(0),
			plannedMinutesPerInterval: z.number().min(0),
			cadenceWindowMinutes: z.number().int().min(15)
		})
	)
});
export type SaveCadencePlanBatch = z.infer<typeof SaveCadencePlanBatchSchema>;

export const CreateHabitInputSchema = z.object({
	title: z.string().min(2, 'عنوان طرح باید حداقل ۲ کاراکتر باشد'),
	parentId: z.string().nullable().default(null),
	category: z.string().default(DEFAULT_HABIT_CATEGORY),
	trackingMode: TrackingModeSchema,
	timeSlot: HabitTimeSlotSchema.optional().default('day'),
	isSituational: z.boolean().default(false),
	scheduleLabel: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	bronzeDesc: z.string().nullable().optional(),
	silverDesc: z.string().nullable().optional(),
	goldDesc: z.string().nullable().optional(),
	emergencyMinDesc: z.string().nullable().optional(),
	defaultIntervals: z.number().int().min(0).default(CADENCE_DEFAULTS.INTERVALS),
	defaultMinutesPerInterval: z.number().min(0).default(CADENCE_DEFAULTS.MINUTES_PER_INTERVAL),
	cadenceWindowMinutes: z
		.number()
		.int()
		.min(CADENCE_DEFAULTS.MIN_WINDOW_MINUTES)
		.default(CADENCE_DEFAULTS.WINDOW_MINUTES),
	reason: z.string().optional()
});
export type CreateHabitInput = z.infer<typeof CreateHabitInputSchema>;

export const MutateHabitStructureSchema = z.object({
	habitId: z.string(),
	title: z.string().min(2),
	category: z.string().default(DEFAULT_HABIT_CATEGORY),
	parentId: z.string().nullable(),
	timeSlot: HabitTimeSlotSchema.optional(),
	isSituational: z.boolean().default(false),
	status: HabitStatusSchema,
	scheduleLabel: z.string().nullable(),
	notes: z.string().nullable(),
	bronzeDesc: z.string().nullable(),
	silverDesc: z.string().nullable(),
	goldDesc: z.string().nullable(),
	emergencyMinDesc: z.string().nullable(),
	defaultMinutesPerInterval: z.number().min(0).optional(),
	reason: z.string().min(2, 'نوشتن دلیل تغییر برای ثبت در تاریخچه الزامی است')
});
export type MutateHabitStructureInput = z.infer<typeof MutateHabitStructureSchema>;

export const BookEntitySchema = z.object({
	id: z.string(),
	title: z.string(),
	author: z.string().nullable(),
	status: BookStatusSchema,
	startedAtIso: z.string().nullable(),
	finishedAtIso: z.string().nullable(),
	rating: z.number().int().min(1).max(5).nullable(),
	notes: z.string().nullable(),
	createdAtIso: z.string(),
	updatedAtIso: z.string().nullable().optional()
});
export type BookEntity = z.infer<typeof BookEntitySchema>;

export const CreateBookInputSchema = z.object({
	title: z.string().min(1, 'نام کتاب الزامی است'),
	author: z.string().optional(),
	status: BookStatusSchema.default('completed'),
	startedJalali: z.string().optional(),
	finishedJalali: z.string().optional(),
	rating: z.number().int().min(1).max(5).nullable().default(5),
	notes: z.string().optional()
});
export type CreateBookInput = z.infer<typeof CreateBookInputSchema>;

export const UpdateBookInputSchema = CreateBookInputSchema.extend({
	bookId: z.string().min(1)
});
export type UpdateBookInput = z.infer<typeof UpdateBookInputSchema>;

export const MediaEntitySchema = z.object({
	id: z.string(),
	title: z.string(),
	category: MediaCategorySchema,
	status: MediaStatusSchema,
	startedAtIso: z.string().nullable(),
	finishedAtIso: z.string().nullable(),
	rating: z.number().int().min(1).max(5).nullable(),
	notes: z.string().nullable(),
	createdAtIso: z.string(),
	updatedAtIso: z.string().nullable().optional()
});
export type MediaEntity = z.infer<typeof MediaEntitySchema>;

export const CreateMediaInputSchema = z.object({
	title: z.string().min(1, 'نام اثر الزامی است'),
	category: MediaCategorySchema.default('movie'),
	status: MediaStatusSchema.default('completed'),
	startedJalali: z.string().optional(),
	finishedJalali: z.string().optional(),
	rating: z.number().int().min(1).max(5).nullable().default(5),
	notes: z.string().optional()
});
export type CreateMediaInput = z.infer<typeof CreateMediaInputSchema>;

export const UpdateMediaInputSchema = CreateMediaInputSchema.extend({
	mediaId: z.string().min(1)
});
export type UpdateMediaInput = z.infer<typeof UpdateMediaInputSchema>;

export const CalendarEventEntitySchema = z.object({
	id: z.string(),
	title: z.string().min(1),
	eventType: CalendarEventTypeSchema,
	isAnnual: z.boolean().default(false),
	dateIso: z.string().nullable(),
	jalaliMonth: z.number().int().min(1).max(12),
	jalaliDay: z.number().int().min(1).max(31),
	isCompleted: z.boolean().default(false),
	notes: z.string().nullable(),
	createdAtIso: z.string(),
	updatedAtIso: z.string().nullable().optional()
});
export type CalendarEventEntity = z.infer<typeof CalendarEventEntitySchema>;

export const CreateCalendarEventInputSchema = z.object({
	title: z.string().min(1, 'عنوان رویداد الزامی است'),
	eventType: CalendarEventTypeSchema.default('occasion'),
	isAnnual: z.boolean().default(false),
	dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
	notes: z.string().optional()
});
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventInputSchema>;

export const LifecycleEventEntitySchema = z.object({
	id: z.string(),
	habitId: z.string().nullable(),
	habitTitleSnapshot: z.string(),
	eventType: LifecycleEventTypeSchema,
	effectiveDateIso: z.string(),
	summary: z.string(),
	reason: z.string().nullable(),
	previousStateJson: z.string().nullable(),
	newStateJson: z.string().nullable(),
	createdAtIso: z.string()
});
export type LifecycleEventEntity = z.infer<typeof LifecycleEventEntitySchema>;

export const NoteEntitySchema = z.object({
	id: z.string(),
	title: z.string(),
	content: z.string(),
	category: z.string().default('عمومی'),
	isPinned: z.boolean().default(false),
	createdAtIso: z.string(),
	updatedAtIso: z.string()
});
export type NoteEntity = z.infer<typeof NoteEntitySchema>;

export const UpsertNoteInputSchema = z.object({
	noteId: z.string().optional(),
	title: z.string().default(''),
	content: z.string().min(1, 'متن یادداشت نمی‌تواند خالی باشد'),
	category: z.string().default('عمومی')
});
export type UpsertNoteInput = z.infer<typeof UpsertNoteInputSchema>;

export const SetupPasswordInputSchema = z
	.object({
		password: z.string().min(4, 'رمز عبور باید حداقل ۴ کاراکتر باشد'),
		confirmPassword: z.string().min(4, 'تکرار رمز عبور الزامی است'),
		website: z.string().optional()
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'رمز عبور و تکرار آن یکسان نیستند',
		path: ['confirmPassword']
	});

export const LoginInputSchema = z.object({
	password: z.string().min(1, 'لطفاً رمز عبور را وارد کنید'),
	website: z.string().optional()
});

export const ChangePasswordInputSchema = z
	.object({
		newPassword: z.string().min(4, 'رمز عبور جدید باید حداقل ۴ کاراکتر باشد'),
		confirmNewPassword: z.string().min(4, 'تکرار رمز عبور جدید الزامی است')
	})
	.refine((data) => data.newPassword === data.confirmNewPassword, {
		message: 'رمز عبور جدید و تکرار آن یکسان نیستند',
		path: ['confirmNewPassword']
	});

export const SyncOutboxMutationSchema = z.discriminatedUnion('kind', [
	z.object({
		id: z.string(),
		kind: z.literal('SAVE_DAILY_ENTRY'),
		queuedAtIso: z.string(),
		payload: SaveDailyEntryInputSchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('SAVE_CADENCE_PLAN'),
		queuedAtIso: z.string(),
		payload: SaveCadencePlanBatchSchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('UPSERT_BOOK'),
		queuedAtIso: z.string(),
		payload: BookEntitySchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('DELETE_BOOK'),
		queuedAtIso: z.string(),
		payload: z.object({ bookId: z.string() })
	}),
	z.object({
		id: z.string(),
		kind: z.literal('UPSERT_MEDIA'),
		queuedAtIso: z.string(),
		payload: MediaEntitySchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('DELETE_MEDIA'),
		queuedAtIso: z.string(),
		payload: z.object({ mediaId: z.string() })
	}),
	z.object({
		id: z.string(),
		kind: z.literal('UPSERT_NOTE'),
		queuedAtIso: z.string(),
		payload: NoteEntitySchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('DELETE_NOTE'),
		queuedAtIso: z.string(),
		payload: z.object({ noteId: z.string() })
	}),
	z.object({
		id: z.string(),
		kind: z.literal('UPSERT_CALENDAR_EVENT'),
		queuedAtIso: z.string(),
		payload: CalendarEventEntitySchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('DELETE_CALENDAR_EVENT'),
		queuedAtIso: z.string(),
		payload: z.object({ eventId: z.string() })
	}),
	z.object({
		id: z.string(),
		kind: z.literal('UPSERT_HABIT'),
		queuedAtIso: z.string(),
		payload: HabitEntitySchema
	}),
	z.object({
		id: z.string(),
		kind: z.literal('ADD_LIFECYCLE_EVENT'),
		queuedAtIso: z.string(),
		payload: LifecycleEventEntitySchema
	})
]);
export type SyncOutboxMutation = z.infer<typeof SyncOutboxMutationSchema>;

export const SyncRequestPayloadSchema = z.object({
	clientId: z.string().default('default-client'),
	knownServerVersionIso: z.string().nullable().default(null),
	mutations: z.array(SyncOutboxMutationSchema).default([])
});
export type SyncRequestPayload = z.infer<typeof SyncRequestPayloadSchema>;

export const LocalWorkspaceSnapshotSchema = z.object({
	versionIso: z.string(),
	syncedAtIso: z.string(),
	habits: z.array(HabitEntitySchema),
	availableTags: z.array(z.string()),
	entries: z.array(
		z.object({
			id: z.string(),
			dateIso: z.string(),
			dayStatus: DayStatusColorSchema,
			reflectionNote: z.string(),
			journalText: z.string().nullable(),
			tags: z.array(z.string()),
			updatedAtIso: z.string()
		})
	),
	logs: z.array(
		z.object({
			id: z.string(),
			dateIso: z.string(),
			habitId: z.string(),
			habitTitleSnapshot: z.string().nullable(),
			achievedTier: z.number().nullable(),
			achievedRuleSnapshot: z.string().nullable(),
			habitSnapshotJson: z.string().nullable(),
			completedIntervals: z.number().nullable(),
			actualMinutesPerInterval: z.number().nullable(),
			totalActualMinutes: z.number().nullable(),
			plannedIntervalsSnapshot: z.number().nullable(),
			plannedMinutesSnapshot: z.number().nullable(),
			updatedAtIso: z.string().nullable()
		})
	),
	cadencePlans: z.array(CadencePlanEntitySchema),
	books: z.array(BookEntitySchema),
	media: z.array(MediaEntitySchema),
	notes: z.array(NoteEntitySchema),
	calendarEvents: z.array(CalendarEventEntitySchema),
	lifecycleEvents: z.array(LifecycleEventEntitySchema)
});
export type LocalWorkspaceSnapshot = z.infer<typeof LocalWorkspaceSnapshotSchema>;

export const ServerSyncResponseSchema = z.object({
	ok: z.boolean(),
	error: z.string().optional(),
	appliedMutationIds: z.array(z.string()),
	serverVersionIso: z.string(),
	appBuildVersion: z.string().optional(),
	hasRemoteUpdates: z.boolean(),
	serverTimeIso: z.string(),
	fullWorkspace: LocalWorkspaceSnapshotSchema.optional()
});
export type ServerSyncResponse = z.infer<typeof ServerSyncResponseSchema>;

export const UpcomingEventBannerItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	eventType: CalendarEventTypeSchema,
	isAnnual: z.boolean(),
	isCompleted: z.boolean(),
	occurrenceDateIso: z.string(),
	humanDateLabel: z.string(),
	daysRemaining: z.number(),
	notes: z.string().nullable()
});
export type UpcomingEventBannerItem = z.infer<typeof UpcomingEventBannerItemSchema>;

export const HabitHistoricalSpecSchema = z.object({
	title: z.string(),
	category: z.string(),
	scheduleLabel: z.string().nullable(),
	notes: z.string().nullable(),
	bronzeDesc: z.string().nullable(),
	silverDesc: z.string().nullable(),
	goldDesc: z.string().nullable(),
	emergencyMinDesc: z.string().nullable(),
	isSituational: z.boolean()
});
export type HabitHistoricalSpec = z.infer<typeof HabitHistoricalSpecSchema>;

export const DayHabitPerformanceItemSchema = z.object({
	habitId: z.string(),
	title: z.string(),
	trackingMode: TrackingModeSchema,
	achievedTier: z.number().nullable(),
	achievedRule: z.string().nullable(),
	actualMinutes: z.number().nullable(),
	completedIntervals: z.number().nullable(),
	plannedMinutes: z.number().nullable(),
	isArchived: z.boolean(),
	specSnapshot: HabitHistoricalSpecSchema
});
export type DayHabitPerformanceItem = z.infer<typeof DayHabitPerformanceItemSchema>;

export const CalendarDayAggregateSchema = z.object({
	iso: z.string(),
	jy: z.number(),
	jm: z.number(),
	jd: z.number(),
	weekdayLabel: z.string(),
	fullHumanLabel: z.string(),
	isToday: z.boolean(),
	entry: z
		.object({
			dayStatus: DayStatusColorSchema,
			reflectionNote: z.string(),
			journalText: z.string().nullable(),
			tags: z.array(z.string())
		})
		.nullable(),
	habitPerformances: z.array(DayHabitPerformanceItemSchema),
	events: z.array(CalendarEventEntitySchema),
	booksActivity: z.array(
		z.object({
			book: BookEntitySchema,
			activityKind: z.enum(['started', 'finished'])
		})
	),
	mediaActivity: z.array(
		z.object({
			media: MediaEntitySchema,
			activityKind: z.enum(['started', 'finished'])
		})
	)
});
export type CalendarDayAggregate = z.infer<typeof CalendarDayAggregateSchema>;

export const DayHabitOutcomeSchema = z.enum([
	'gold',
	'silver',
	'bronze',
	'failed',
	'skipped',
	'unlogged'
]);
export type DayHabitOutcome = z.infer<typeof DayHabitOutcomeSchema>;

export const AnalyticsRawLogSchema = z.object({
	id: z.string(),
	dateIso: z.string(),
	habitId: z.string(),
	habitTitleSnapshot: z.string().nullable().optional(),
	achievedTier: z.number().nullable(),
	achievedRuleSnapshot: z.string().nullable().optional(),
	habitSnapshotJson: z.string().nullable().optional(),
	completedIntervals: z.number().nullable().optional(),
	actualMinutesPerInterval: z.number().nullable().optional(),
	totalActualMinutes: z.number().nullable().optional(),
	plannedIntervalsSnapshot: z.number().nullable().optional(),
	plannedMinutesSnapshot: z.number().nullable().optional()
});
export type AnalyticsRawLog = z.infer<typeof AnalyticsRawLogSchema>;

export const AnalyticsRawEntrySchema = z.object({
	dateIso: z.string(),
	dayStatus: DayStatusColorSchema,
	reflectionNote: z.string(),
	tags: z.array(z.string())
});
export type AnalyticsRawEntry = z.infer<typeof AnalyticsRawEntrySchema>;

export const RawCalendarDayEntrySchema = z.object({
	dateIso: z.string(),
	dayStatus: DayStatusColorSchema,
	reflectionNote: z.string(),
	journalText: z.string().nullable(),
	tags: z.array(z.string()).optional(),
	tagsJson: z.string().optional()
});
export type RawCalendarDayEntry = z.infer<typeof RawCalendarDayEntrySchema>;

export const LocalDailyEntryRecordSchema = z.object({
	dateIso: z.string(),
	dayStatus: DayStatusColorSchema,
	reflectionNote: z.string(),
	journalText: z.string().nullable(),
	tags: z.array(z.string()),
	updatedAtIso: z.string()
});
export type LocalDailyEntryRecord = z.infer<typeof LocalDailyEntryRecordSchema>;

export const LocalHabitLogRecordSchema = HabitLogItemInputSchema.extend({
	id: z.string(),
	dateIso: z.string(),
	updatedAtIso: z.string()
});
export type LocalHabitLogRecord = z.infer<typeof LocalHabitLogRecordSchema>;

export const LocalReflectionTagRecordSchema = z.object({
	id: z.string(),
	label: z.string(),
	sortOrder: z.number()
});
export type LocalReflectionTagRecord = z.infer<typeof LocalReflectionTagRecordSchema>;

export const SyncMetaRecordSchema = z.object({
	key: z.enum(['meta:sync', 'meta:theme']),
	clientId: z.string(),
	knownServerVersionIso: z.string().nullable(),
	lastSyncedAtIso: z.string().nullable(),
	themeMode: z.enum(['dark', 'light']).optional()
});
export type SyncMetaRecord = z.infer<typeof SyncMetaRecordSchema>;

export const LocalAuthRecordSchema = z.object({
	key: z.literal('auth:session'),
	isAuthenticated: z.boolean(),
	isPasswordConfigured: z.boolean(),
	expiresAtIso: z.string(),
	verifierSaltHex: z.string(),
	passwordVerifierHex: z.string(),
	updatedAtIso: z.string()
});
export type LocalAuthRecord = z.infer<typeof LocalAuthRecordSchema>;

export const HabitRuleDiffItemSchema = z.object({
	fieldLabel: z.string(),
	previousValue: z.string(),
	newValue: z.string()
});
export type HabitRuleDiffItem = z.infer<typeof HabitRuleDiffItemSchema>;

export const HabitEvolutionItemSchema = z.object({
	id: z.string(),
	habitId: z.string().nullable(),
	habitTitle: z.string(),
	eventType: LifecycleEventTypeSchema,
	eventTypeLabel: z.string(),
	badgeClasses: z.string(),
	effectiveDateIso: z.string(),
	jalaliSlash: z.string(),
	humanDateLabel: z.string(),
	summary: z.string(),
	reason: z.string().nullable(),
	diffs: z.array(HabitRuleDiffItemSchema),
	beforeSuccessRate: z.number().nullable(),
	afterSuccessRate: z.number().nullable(),
	impactDelta: z.number().nullable()
});
export type HabitEvolutionItem = z.infer<typeof HabitEvolutionItemSchema>;

export const HabitDailyPointSchema = z.object({
	dateIso: z.string(),
	jalaliSlash: z.string(),
	humanLabel: z.string(),
	weekdayLabel: z.string(),
	weekdayIndex: z.number(),
	outcome: DayHabitOutcomeSchema,
	tierLevel: z.number().nullable(),
	score: z.number().nullable(),
	rollingAvgScore: z.number().nullable(),
	ruleSnapshot: z.string().nullable(),
	actualMinutes: z.number().nullable(),
	plannedMinutes: z.number().nullable(),
	completedIntervals: z.number().nullable(),
	dayTags: z.array(z.string()),
	lifecycleEventsOnDay: z.array(HabitEvolutionItemSchema)
});
export type HabitDailyPoint = z.infer<typeof HabitDailyPointSchema>;

export const WeekdayPerformanceStatSchema = z.object({
	weekdayIndex: z.number(),
	weekdayLabel: z.string(),
	loggedDays: z.number(),
	successDays: z.number(),
	goldDays: z.number(),
	successRate: z.number(),
	avgScore: z.number()
});
export type WeekdayPerformanceStat = z.infer<typeof WeekdayPerformanceStatSchema>;

export const TagCorrelationStatSchema = z.object({
	tag: z.string(),
	occurrences: z.number(),
	avgScoreWithTag: z.number(),
	successRateWithTag: z.number(),
	impactDelta: z.number()
});
export type TagCorrelationStat = z.infer<typeof TagCorrelationStatSchema>;

export const HabitComparisonRowSchema = z.object({
	habit: HabitEntitySchema,
	parentTitle: z.string().nullable(),
	isComposite: z.boolean(),
	loggedDays: z.number(),
	successDays: z.number(),
	goldCount: z.number(),
	silverCount: z.number(),
	bronzeCount: z.number(),
	failedCount: z.number(),
	skippedCount: z.number(),
	consistencyRate: z.number(),
	avgQualityScore: z.number(),
	currentStreak: z.number(),
	bestStreak: z.number(),
	trendDelta: z.number(),
	lifecycleChangesCount: z.number()
});
export type HabitComparisonRow = z.infer<typeof HabitComparisonRowSchema>;

export const SelectedHabitAnalyticsSchema = z.object({
	habit: HabitEntitySchema,
	parentTitle: z.string().nullable(),
	isComposite: z.boolean(),
	childrenCount: z.number(),
	maxSupportedTier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	dailySeries: z.array(HabitDailyPointSchema),
	loggedDaysCount: z.number(),
	successDaysCount: z.number(),
	goldCount: z.number(),
	silverCount: z.number(),
	bronzeCount: z.number(),
	failedCount: z.number(),
	skippedCount: z.number(),
	consistencyRate: z.number(),
	goldRate: z.number(),
	avgQualityScore: z.number(),
	trendDelta: z.number(),
	currentStreak: z.number(),
	bestStreak: z.number(),
	totalActualMinutes: z.number(),
	totalPlannedMinutes: z.number(),
	avgActualMinutes: z.number(),
	avgPlannedMinutes: z.number(),
	weekdayStats: z.array(WeekdayPerformanceStatSchema),
	bestWeekday: WeekdayPerformanceStatSchema.nullable(),
	weakestWeekday: WeekdayPerformanceStatSchema.nullable(),
	tagCorrelations: z.array(TagCorrelationStatSchema),
	evolutionTimeline: z.array(HabitEvolutionItemSchema)
});
export type SelectedHabitAnalytics = z.infer<typeof SelectedHabitAnalyticsSchema>;

export const FullAnalyticsReportSchema = z.object({
	range: AnalyticsTimeRangeSchema,
	startDateIso: z.string(),
	endDateIso: z.string(),
	totalDaysInWindow: z.number(),
	selectableHabits: z.array(
		z.object({
			habit: HabitEntitySchema,
			parentTitle: z.string().nullable(),
			isComposite: z.boolean(),
			displayLabel: z.string()
		})
	),
	selectedHabitReport: SelectedHabitAnalyticsSchema.nullable(),
	comparisonRows: z.array(HabitComparisonRowSchema)
});
export type FullAnalyticsReport = z.infer<typeof FullAnalyticsReportSchema>;

export const DatabaseBackupPayloadSchema = z.object({
	version: z.literal(1),
	appName: z.literal('new-life'),
	exportedAtIso: z.string(),
	jalaliDate: z.string(),
	data: z.object({
		habits: z.array(HabitEntitySchema),
		dailyEntries: z.array(
			z.object({
				id: z.string(),
				dateIso: z.string(),
				dayStatus: DayStatusColorSchema,
				reflectionNote: z.string(),
				journalText: z.string().nullable(),
				tagsJson: z.string(),
				updatedAtIso: z.string()
			})
		),
		habitLogs: z.array(
			z.object({
				id: z.string(),
				dateIso: z.string(),
				habitId: z.string(),
				habitTitleSnapshot: z.string().nullable(),
				achievedTier: z.number().nullable(),
				achievedRuleSnapshot: z.string().nullable(),
				habitSnapshotJson: z.string().nullable(),
				completedIntervals: z.number().nullable(),
				actualMinutesPerInterval: z.number().nullable(),
				totalActualMinutes: z.number().nullable(),
				plannedIntervalsSnapshot: z.number().nullable(),
				plannedMinutesSnapshot: z.number().nullable(),
				updatedAtIso: z.string().nullable()
			})
		),
		cadencePlans: z.array(CadencePlanEntitySchema),
		books: z.array(BookEntitySchema),
		media: z.array(MediaEntitySchema),
		notes: z.array(NoteEntitySchema),
		calendarEvents: z.array(CalendarEventEntitySchema),
		lifecycleEvents: z.array(LifecycleEventEntitySchema),
		reflectionTags: z.array(
			z.object({
				id: z.string(),
				label: z.string(),
				sortOrder: z.number()
			})
		)
	})
});
export type DatabaseBackupPayload = z.infer<typeof DatabaseBackupPayloadSchema>;

export { parseTagsJson } from './tags';
