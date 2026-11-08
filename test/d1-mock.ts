import { DatabaseSync } from 'node:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function createMockD1(): any {
  const db = new DatabaseSync(':memory:');

  // Load migrations
  const migrationsDir = path.resolve(import.meta.dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      db.exec(sql);
    }
  }

  function wrapStatement(sql: string) {
    return {
      _params: [] as any[],
      bind(...args: any[]) {
        this._params = args;
        return this;
      },
      async first<T = any>(colName?: string): Promise<T | null> {
        const stmt = db.prepare(sql);
        const row = stmt.get(...this._params) as any;
        if (!row) return null;
        if (colName) return row[colName];
        return row;
      },
      async all<T = any>(): Promise<{ results: T[] }> {
        const stmt = db.prepare(sql);
        const results = stmt.all(...this._params) as T[];
        return { results };
      },
      async run(): Promise<{ success: boolean; meta: any }> {
        const stmt = db.prepare(sql);
        const info = stmt.run(...this._params);
        return { success: true, meta: info };
      },
    };
  }

  return {
    _rawDb: db,
    prepare(sql: string) {
      return wrapStatement(sql);
    },
    async batch(statements: any[]) {
      const results = [];
      for (const s of statements) {
        results.push(await s.run());
      }
      return results;
    },
    async exec(sql: string) {
      return db.exec(sql);
    },
  };
}
