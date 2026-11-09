import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { ensurePostgreSqlSchemaBootstrapped } from '~~/server/database/bootstrap';
import * as schema from '~~/server/database/schema';

const connectionString =
	process.env.DATABASE_URL ||
	'postgresql://postgres:postgres@localhost:5432/personal_os';

const globalForPg = globalThis as unknown as {
	__personalOsPgClient?: ReturnType<typeof postgres>;
};

export const pgClient =
	globalForPg.__personalOsPgClient ??
	postgres(connectionString, {
		max: 10,
		idle_timeout: 20,
		max_lifetime: 60 * 30,
		connect_timeout: 10,
		prepare: false,
		onnotice: () => {}
	});

if (process.env.NODE_ENV !== 'production') {
	globalForPg.__personalOsPgClient = pgClient;
}

export const db = drizzle(pgClient, { schema });

let isSchemaVerified = false;
let schemaInitPromise: Promise<void> | null = null;

export async function ensureDatabaseReady(): Promise<void> {
	if (isSchemaVerified) return;
	if (!schemaInitPromise) {
		schemaInitPromise = ensurePostgreSqlSchemaBootstrapped(pgClient)
			.then(() => {
				isSchemaVerified = true;
			})
			.catch((err) => {
				schemaInitPromise = null;
				throw err;
			});
	}
	return schemaInitPromise;
}
