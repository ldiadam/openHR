ALTER TABLE employees ADD COLUMN card_uuid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_card_uuid ON employees(card_uuid);
