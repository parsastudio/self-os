import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DATABASE_URL || './data/local.db';

if (dbPath !== ':memory:') {
	const dir = path.dirname(dbPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

const client = new Database(dbPath);
client.pragma('journal_mode = WAL');
client.pragma('synchronous = NORMAL');
client.pragma('busy_timeout = 5000');
client.pragma('foreign_keys = ON');

function ensureProductionSchema(sqlite: Database.Database): void {
	sqlite.exec(`
		CREATE TABLE IF NOT EXISTS habits (
			id TEXT PRIMARY KEY,
			parent_id TEXT,
			title TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'عمومی',
			tracking_mode TEXT NOT NULL DEFAULT 'tiered',
			time_slot TEXT NOT NULL DEFAULT 'day',
			is_situational INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'active',
			schedule_label TEXT,
			notes TEXT,
			bronze_desc TEXT,
			silver_desc TEXT,
			gold_desc TEXT,
			emergency_min_desc TEXT,
			default_intervals INTEGER NOT NULL DEFAULT 2,
			default_minutes_per_interval REAL NOT NULL DEFAULT 10,
			cadence_window_minutes INTEGER NOT NULL DEFAULT 60,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at_iso TEXT NOT NULL,
			updated_at_iso TEXT
		);

		CREATE TABLE IF NOT EXISTS cadence_plans (
			id TEXT PRIMARY KEY,
			date_iso TEXT NOT NULL,
			habit_id TEXT NOT NULL,
			planned_intervals INTEGER NOT NULL,
			planned_minutes_per_interval REAL NOT NULL,
			cadence_window_minutes INTEGER NOT NULL DEFAULT 60,
			updated_at_iso TEXT
		);

		CREATE TABLE IF NOT EXISTS daily_entries (
			id TEXT PRIMARY KEY,
			date_iso TEXT NOT NULL UNIQUE,
			day_status TEXT NOT NULL DEFAULT 'optimal',
			reflection_note TEXT NOT NULL DEFAULT '',
			journal_text TEXT,
			tags_json TEXT NOT NULL DEFAULT '[]',
			updated_at_iso TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS habit_logs (
			id TEXT PRIMARY KEY,
			date_iso TEXT NOT NULL,
			habit_id TEXT NOT NULL,
			habit_title_snapshot TEXT,
			achieved_tier INTEGER,
			achieved_rule_snapshot TEXT,
			habit_snapshot_json TEXT,
			completed_intervals INTEGER,
			actual_minutes_per_interval REAL,
			total_actual_minutes REAL,
			planned_intervals_snapshot INTEGER,
			planned_minutes_snapshot REAL,
			updated_at_iso TEXT
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

		CREATE TABLE IF NOT EXISTS reflection_tags (
			id TEXT PRIMARY KEY,
			label TEXT NOT NULL UNIQUE,
			sort_order INTEGER NOT NULL DEFAULT 0
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
			updated_at_iso TEXT
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
			updated_at_iso TEXT
		);

		CREATE TABLE IF NOT EXISTS calendar_events (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			event_type TEXT NOT NULL DEFAULT 'occasion',
			is_annual INTEGER NOT NULL DEFAULT 0,
			date_iso TEXT,
			jalali_month INTEGER NOT NULL,
			jalali_day INTEGER NOT NULL,
			is_completed INTEGER NOT NULL DEFAULT 0,
			notes TEXT,
			created_at_iso TEXT NOT NULL,
			updated_at_iso TEXT
		);

		CREATE TABLE IF NOT EXISTS notes (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT '',
			content TEXT NOT NULL,
			category TEXT NOT NULL DEFAULT 'عمومی',
			is_pinned INTEGER NOT NULL DEFAULT 0,
			created_at_iso TEXT NOT NULL,
			updated_at_iso TEXT NOT NULL
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
	`);

	sqlite.exec(`
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
		CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at_iso);
	`);
}

ensureProductionSchema(client);

export const db = drizzle(client, { schema });
