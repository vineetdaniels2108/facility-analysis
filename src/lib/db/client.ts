import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

let pool: Pool | null = null;

function getPool(): Pool {
    if (!pool) {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('[db] DATABASE_URL environment variable is not set');
        }
        const isRds = connectionString.includes('.rds.amazonaws.com');
        pool = new Pool({
            connectionString,
            ssl: isRds ? { rejectUnauthorized: false } : false,
            max: 10,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
        });
        pool.on('error', (err) => {
            console.error('[db] Unexpected pool error:', err);
        });
    }
    return pool;
}

export function isDbConfigured(): boolean {
    return !!process.env.DATABASE_URL;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const p = getPool();
    try {
        return await p.query<T>(sql, params);
    } catch (err) {
        console.error('[db] Query error:', err, '\nSQL:', sql.slice(0, 200));
        throw err;
    }
}

export async function withTransaction<T>(
    fn: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await getPool().connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function upsertMany(
    client: PoolClient,
    table: string,
    rows: Record<string, unknown>[],
    conflictColumns: string[]
): Promise<number> {
    if (rows.length === 0) return 0;

    const cols = Object.keys(rows[0]);
    const updateCols = cols.filter(c => !conflictColumns.includes(c));

    const values: unknown[] = [];
    const placeholderRows = rows.map((row, rowIdx) => {
        const placeholders = cols.map((_, colIdx) => {
            values.push(row[cols[colIdx]]);
            return `$${rowIdx * cols.length + colIdx + 1}`;
        });
        return `(${placeholders.join(', ')})`;
    });

    const updateClause = updateCols.length > 0
        ? `DO UPDATE SET ${updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')}`
        : 'DO NOTHING';

    const sql = `
        INSERT INTO ${table} (${cols.map(c => `"${c}"`).join(', ')})
        VALUES ${placeholderRows.join(', ')}
        ON CONFLICT (${conflictColumns.map(c => `"${c}"`).join(', ')}) ${updateClause}
    `;

    const result = await client.query(sql, values);
    return result.rowCount ?? 0;
}
