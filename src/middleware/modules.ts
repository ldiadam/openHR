import { Context, Next } from 'hono';
import { Bindings } from '../types';
import { parseModulesConfig, ToggleableModuleId } from '../../shared/modules';

/**
 * Guards a module's API routes against company-level module toggles.
 * Defaults to enabled when `modules_json` is unset or the column is absent.
 */
export function requireModule(moduleId: ToggleableModuleId) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    try {
      const comp = await c.env.DB.prepare(`SELECT modules_json FROM companies LIMIT 1`).first<{
        modules_json?: string | null;
      }>();
      const hasDocuSealCreds = Boolean(
        c.env.DOCUSEAL_URL?.trim() && c.env.DOCUSEAL_API_TOKEN?.trim()
      );
      const config = parseModulesConfig(comp?.modules_json, { hasDocuSealCreds });
      if (!config[moduleId]) {
        return c.json(
          { error: `Module "${moduleId}" is disabled in Company Settings.` },
          403
        );
      }
    } catch {
      // If companies table or modules_json column is unavailable, fail open to defaults.
    }
    await next();
  };
}
