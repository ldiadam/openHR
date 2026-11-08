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

  // Insert mock test employees for unit/acceptance test runner
  db.exec(`UPDATE employees SET nik = 'EMP001', full_name = 'Budi Santoso' WHERE id = 'emp-001';`);
  const existingEmp4 = db.prepare(`SELECT id FROM employees WHERE id = 'emp-004'`).get();
  if (!existingEmp4) {
    db.exec(`
      INSERT OR IGNORE INTO employees (
          id, tenant_id, company_id, branch_id, department_id, manager_id,
          nik, full_name, ktp_number, npwp_number, date_of_birth, place_of_birth, gender, religion, marital_status, ptkp_status,
          address, phone, personal_email, company_email,
          employment_status, lifecycle_status, join_date, contract_start_date, contract_end_date, job_title, shift_pattern_id,
          base_salary, fixed_allowances, fixed_allowances_detail, bank_name, bank_account_number, bank_account_holder,
          bpjs_kesehatan_number, bpjs_tk_number, bpjs_wage_basis
      ) VALUES 
      ('emp-002', 'default', 'comp-nusantara', 'branch-jkt', 'dept-hr', 'emp-001', 'EMP002', 'Siti Rahmawati', '3171020202880002', '09.234.567.8-012.000', '1988-08-20', 'Bandung', 'female', 'Islam', 'married', 'K/1', 'Jl. Kemang Raya No. 45, Jakarta Selatan', '081234567891', 'siti.rahma@personal.id', 'siti.rahma@nusantara.id', 'PKWTT', 'active', '2024-03-01', '2024-03-01', NULL, 'HR Operations Manager', 'shift-reg', 12000000, 1500000, '[{"name":"Tunjangan Posisi","amount":1500000}]', 'Mandiri', '1370001234567', 'Siti Rahmawati', '00012345679', '99887766555', 13500000),
      ('emp-003', 'default', 'comp-nusantara', 'branch-jkt', 'dept-fin', 'emp-001', 'EMP003', 'Dewi Lestari', '3171030303910003', '09.345.678.9-013.000', '1991-11-10', 'Surabaya', 'female', 'Kristen', 'single', 'TK/1', 'Jl. Kuningan Barat No. 8, Jakarta Selatan', '081234567892', 'dewi.lestari@personal.id', 'dewi.lestari@nusantara.id', 'PKWTT', 'active', '2024-06-01', '2024-06-01', NULL, 'Senior Finance Officer', 'shift-reg', 9000000, 1000000, '[{"name":"Tunjangan Transportasi","amount":1000000}]', 'BCA', '4567890123', 'Dewi Lestari', '00012345680', '99887766556', 10000000),
      ('emp-004', 'default', 'comp-nusantara', 'branch-jkt', 'dept-eng', 'emp-002', 'EMP004', 'Agus Setiawan', '3171040404900004', '09.456.789.0-014.000', '1990-03-25', 'Yogyakarta', 'male', 'Islam', 'married', 'K/2', 'Jl. Pancoran Barat No. 19, Jakarta Selatan', '081234567893', 'agus.setiawan@personal.id', 'agus.setiawan@nusantara.id', 'PKWTT', 'active', '2024-02-15', '2024-02-15', NULL, 'Lead Software Engineer', 'shift-reg', 14000000, 1000000, '[{"name":"Tunjangan Komunikasi","amount":1000000}]', 'BCA', '5678901234', 'Agus Setiawan', '00012345681', '99887766557', 15000000),
      ('emp-005', 'default', 'comp-nusantara', 'branch-bdg', 'dept-ops', 'emp-002', 'EMP005', 'Rina Wijaya', '3273010101960005', '09.567.890.1-015.000', '1996-07-14', 'Bandung', 'female', 'Islam', 'single', 'TK/0', 'Jl. Dago Atas No. 88, Bandung', '081234567894', 'rina.wijaya@personal.id', 'rina.wijaya@nusantara.id', 'PKWT', 'active', '2025-12-01', '2025-12-01', '2026-11-30', 'Operations Associate', 'shift-pagi', 5500000, 500000, '[{"name":"Tunjangan Makan","amount":500000}]', 'Mandiri', '1310009876543', 'Rina Wijaya', '00012345682', '99887766558', 6000000);

      INSERT OR IGNORE INTO users (id, tenant_id, email, password_hash, role, employee_id, is_active) VALUES
      ('usr-002', 'default', 'siti.rahma@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'manager', 'emp-002', 1),
      ('usr-003', 'default', 'dewi.lestari@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'finance', 'emp-003', 1),
      ('usr-004', 'default', 'agus.setiawan@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'employee', 'emp-004', 1),
      ('usr-005', 'default', 'rina.wijaya@nusantara.id', 'a109e36947ad56de1dca1cc49f0ef8ac9ad9a7b1aa0df41fb3c4cb73c1ff01ea', 'employee', 'emp-005', 1);

      INSERT OR IGNORE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
      SELECT 'bal-' || e.id || '-annual', 'default', e.id, 'lt-annual', 2026, 12, 0, 12 FROM employees e;
      INSERT OR IGNORE INTO leave_balances (id, tenant_id, employee_id, leave_type_id, year, total_entitled, used_days, remaining_days)
      SELECT 'bal-' || e.id || '-sick', 'default', e.id, 'lt-sick', 2026, 14, 0, 14 FROM employees e;
    `);
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
