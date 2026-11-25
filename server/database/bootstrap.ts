import type postgres from 'postgres';

const BOOTSTRAP_DDL_SQL = `
	CREATE TABLE IF NOT EXISTS habits (
		id TEXT PRIMARY KEY,
		parent_id TEXT,
		title TEXT NOT NULL,
		tracking_mode TEXT NOT NULL DEFAULT 'tiered',
		time_slot TEXT NOT NULL DEFAULT 'day',
		is_situational BOOLEAN NOT NULL DEFAULT FALSE,
		status TEXT NOT NULL DEFAULT 'active',
		schedule_label TEXT,
		notes TEXT,
		bronze_desc TEXT,
		silver_desc TEXT,
		gold_desc TEXT,
		emergency_min_desc TEXT,
		default_minutes_per_interval DOUBLE PRECISION NOT NULL DEFAULT 10,
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS cadence_plans (
		id TEXT PRIMARY KEY,
		date_iso TEXT NOT NULL,
		habit_id TEXT NOT NULL,
		planned_minutes_per_interval DOUBLE PRECISION NOT NULL,
		updated_at_iso TEXT,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS daily_entries (
		id TEXT PRIMARY KEY,
		date_iso TEXT NOT NULL UNIQUE,
		day_status TEXT NOT NULL DEFAULT 'optimal',
		journal_text TEXT,
		updated_at_iso TEXT NOT NULL,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS habit_logs (
		id TEXT PRIMARY KEY,
		date_iso TEXT NOT NULL,
		habit_id TEXT NOT NULL,
		habit_title_snapshot TEXT,
		achieved_tier INTEGER,
		achieved_rule_snapshot TEXT,
		habit_snapshot_json TEXT,
		actual_minutes_per_interval DOUBLE PRECISION,
		planned_minutes_snapshot DOUBLE PRECISION,
		updated_at_iso TEXT,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS habit_lifecycle_events (
		id TEXT PRIMARY KEY,
		habit_id TEXT,
		habit_title_snapshot TEXT NOT NULL,
		event_type TEXT NOT NULL,
		effective_date_iso TEXT NOT NULL,
		summary TEXT NOT NULL,
		reason TEXT,
		previous_state_json TEXT,
		new_state_json TEXT,
		created_at_iso TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS books (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		author TEXT,
		status TEXT NOT NULL DEFAULT 'completed',
		started_at_iso TEXT,
		finished_at_iso TEXT,
		rating INTEGER DEFAULT 5,
		notes TEXT,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS media_logs (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		category TEXT NOT NULL DEFAULT 'movie',
		status TEXT NOT NULL DEFAULT 'completed',
		started_at_iso TEXT,
		finished_at_iso TEXT,
		rating INTEGER DEFAULT 5,
		notes TEXT,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS calendar_events (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		is_annual BOOLEAN NOT NULL DEFAULT FALSE,
		date_iso TEXT,
		jalali_month INTEGER NOT NULL,
		jalali_day INTEGER NOT NULL,
		is_completed BOOLEAN NOT NULL DEFAULT FALSE,
		notes TEXT,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS notes (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL DEFAULT '',
		content TEXT NOT NULL,
		category TEXT NOT NULL DEFAULT 'عمومی',
		is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT NOT NULL,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS app_auth (
		id TEXT PRIMARY KEY,
		password_hash TEXT NOT NULL,
		password_salt TEXT NOT NULL,
		updated_at_iso TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		id TEXT PRIMARY KEY,
		created_at_iso TEXT NOT NULL,
		expires_at_iso TEXT NOT NULL,
		last_seen_at_iso TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS people (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		relation TEXT NOT NULL DEFAULT 'آشنا',
		contact_info TEXT,
		birthday_year INTEGER,
		birthday_month INTEGER,
		birthday_day INTEGER,
		notes TEXT,
		is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
		created_at_iso TEXT NOT NULL,
		updated_at_iso TEXT NOT NULL,
		deleted_at_iso TEXT
	);

	CREATE TABLE IF NOT EXISTS sync_state (
		id TEXT PRIMARY KEY,
		structural_version_iso TEXT NOT NULL
	);

	CREATE INDEX IF NOT EXISTS idx_habits_parent_id ON habits(parent_id);
	CREATE INDEX IF NOT EXISTS idx_habits_updated_at ON habits(updated_at_iso);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_cadence_plans_date_habit ON cadence_plans(date_iso, habit_id);
	CREATE INDEX IF NOT EXISTS idx_cadence_plans_updated_at ON cadence_plans(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_daily_entries_updated_at ON daily_entries(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_habit_logs_date_iso ON habit_logs(date_iso);
	CREATE UNIQUE INDEX IF NOT EXISTS idx_habit_logs_date_habit ON habit_logs(date_iso, habit_id);
	CREATE INDEX IF NOT EXISTS idx_habit_logs_updated_at ON habit_logs(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_lifecycle_events_habit_id ON habit_lifecycle_events(habit_id);
	CREATE INDEX IF NOT EXISTS idx_books_updated_at ON books(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_books_dates ON books(started_at_iso, finished_at_iso);
	CREATE INDEX IF NOT EXISTS idx_media_logs_updated_at ON media_logs(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_media_logs_dates ON media_logs(started_at_iso, finished_at_iso);
	CREATE INDEX IF NOT EXISTS idx_calendar_events_updated_at ON calendar_events(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_calendar_events_date ON calendar_events(date_iso);
	CREATE INDEX IF NOT EXISTS idx_calendar_events_jalali ON calendar_events(jalali_month, jalali_day);
	CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_people_updated_at ON people(updated_at_iso);
	CREATE INDEX IF NOT EXISTS idx_people_birthday ON people(birthday_month, birthday_day);
	CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at_iso);
`;

export async function ensurePostgreSqlSchemaBootstrapped(
	sqlClient: ReturnType<typeof postgres>
): Promise<void> {
	const checkRows = await sqlClient<{ reg: string | null; habits_reg: string | null }[]>`
		SELECT to_regclass('public.sync_state') AS reg,
		       to_regclass('public.habits') AS habits_reg
	`;
	if (!checkRows[0]?.reg || !checkRows[0]?.habits_reg) {
		await sqlClient.unsafe(BOOTSTRAP_DDL_SQL);
		return;
	}

	const legacyCols = await sqlClient<{ exists_col: boolean }[]>`
		SELECT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND (
				(table_name = 'habits' AND column_name IN ('default_intervals', 'cadence_window_minutes'))
				OR (table_name = 'cadence_plans' AND column_name IN ('planned_intervals', 'cadence_window_minutes'))
				OR (table_name = 'habit_logs' AND column_name IN ('completed_intervals', 'total_actual_minutes', 'planned_intervals_snapshot'))
			  )
		) AS exists_col
	`;

	if (legacyCols[0]?.exists_col) {
		await sqlClient.unsafe(`
			ALTER TABLE habits DROP COLUMN IF EXISTS default_intervals;
			ALTER TABLE habits DROP COLUMN IF EXISTS cadence_window_minutes;
			ALTER TABLE cadence_plans DROP COLUMN IF EXISTS planned_intervals;
			ALTER TABLE cadence_plans DROP COLUMN IF EXISTS cadence_window_minutes;
			ALTER TABLE habit_logs DROP COLUMN IF EXISTS completed_intervals;
			ALTER TABLE habit_logs DROP COLUMN IF EXISTS total_actual_minutes;
			ALTER TABLE habit_logs DROP COLUMN IF EXISTS planned_intervals_snapshot;
		`);
	}

	const peopleCheck = await sqlClient<{ people_reg: string | null }[]>`
		SELECT to_regclass('public.people') AS people_reg
	`;
	if (!peopleCheck[0]?.people_reg) {
		await sqlClient.unsafe(`
			CREATE TABLE IF NOT EXISTS people (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				relation TEXT NOT NULL DEFAULT 'آشنا',
				contact_info TEXT,
				birthday_year INTEGER,
				birthday_month INTEGER,
				birthday_day INTEGER,
				notes TEXT,
				is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
				created_at_iso TEXT NOT NULL,
				updated_at_iso TEXT NOT NULL,
				deleted_at_iso TEXT
			);
			CREATE INDEX IF NOT EXISTS idx_people_updated_at ON people(updated_at_iso);
			CREATE INDEX IF NOT EXISTS idx_people_birthday ON people(birthday_month, birthday_day);
		`);
	}

	const softDeleteCheck = await sqlClient<{ missing_soft_delete: boolean }[]>`
		SELECT NOT EXISTS (
			SELECT 1
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'books'
			  AND column_name = 'deleted_at_iso'
		) AS missing_soft_delete
	`;

	if (softDeleteCheck[0]?.missing_soft_delete) {
		const resetIso = new Date().toISOString();
		await sqlClient.unsafe(`
			ALTER TABLE cadence_plans ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE daily_entries ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE habit_logs ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE books ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE media_logs ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			ALTER TABLE people ADD COLUMN IF NOT EXISTS deleted_at_iso TEXT;
			DELETE FROM sync_state WHERE id LIKE 'del:%';
			INSERT INTO sync_state (id, structural_version_iso)
			VALUES ('singleton', '${resetIso}')
			ON CONFLICT (id) DO UPDATE SET
				structural_version_iso = GREATEST(sync_state.structural_version_iso, excluded.structural_version_iso);
		`);
	}
}
