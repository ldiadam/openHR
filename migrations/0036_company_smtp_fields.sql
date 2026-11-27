-- Migration 0036: separate generic SMTP fields from Purelymail API mailbox provisioning
ALTER TABLE companies ADD COLUMN smtp_host TEXT;
ALTER TABLE companies ADD COLUMN smtp_port INTEGER;
ALTER TABLE companies ADD COLUMN smtp_user TEXT;
