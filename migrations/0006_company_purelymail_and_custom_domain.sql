-- Migration 0006: Custom domain and Purelymail settings in companies table
ALTER TABLE companies ADD COLUMN custom_domain TEXT;
ALTER TABLE companies ADD COLUMN purelymail_domain TEXT;
ALTER TABLE companies ADD COLUMN purelymail_from_address TEXT;
ALTER TABLE companies ADD COLUMN purelymail_api_token TEXT;
ALTER TABLE companies ADD COLUMN purelymail_smtp_pass TEXT;
