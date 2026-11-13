import { Bindings } from '../types';
import { getWorkflow } from './signing-workflows';

/**
 * Single entry point for "a signing request just reached completed".
 * Every workflow funnels through here so no route needs bespoke completion code.
 */
export async function onSigningCompleted(env: Bindings, request: any): Promise<void> {
  const workflow = getWorkflow(request?.workflow || request?.template_code);

  await env.DB.prepare(
    `INSERT INTO audit_logs (id, tenant_id, user_id, action, entity_type, entity_id, new_values)
     VALUES (?, 'default', NULL, 'SIGNING_WORKFLOW_COMPLETED', 'signing_requests', ?, ?)`
  )
    .bind(
      `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      request.id,
      JSON.stringify({
        workflow: workflow?.code || request.workflow || request.template_code,
        completion_effect: workflow?.completionEffect || 'audit_only',
      })
    )
    .run();

  // The app has no generic onboarding/offboarding checklist table yet, so the
  // completion effect is recorded as a durable audit signal that the relevant
  // HR workflow observes. Notifications are sent by the webhook handler.
  switch (workflow?.completionEffect) {
    case 'onboarding_step':
    case 'offboarding_step':
    case 'acknowledged':
    case 'audit_only':
    default:
      return;
  }
}
