import test from 'node:test';
import assert from 'node:assert/strict';
import { runInBackground, resolveEmailApi } from '../src/services/smtp';

test('runInBackground schedules the task on the execution context', async () => {
  let scheduled: Promise<unknown> | undefined;
  let finished = false;

  const ctx = {
    executionCtx: {
      waitUntil(promise: Promise<unknown>) {
        scheduled = promise;
      },
    },
  };

  runInBackground(ctx, new Promise<void>((resolve) => {
    setTimeout(() => {
      finished = true;
      resolve();
    }, 5);
  }));

  assert.ok(scheduled, 'task should be passed to waitUntil');
  await scheduled;
  assert.equal(finished, true);
});

test('runInBackground still runs without an execution context', async () => {
  let finished = false;

  runInBackground({} as any, new Promise<void>((resolve) => {
    setTimeout(() => {
      finished = true;
      resolve();
    }, 5);
  }));

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(finished, true);
});

test('runInBackground swallows task failures', async () => {
  let scheduled: Promise<unknown> | undefined;
  const ctx = {
    executionCtx: {
      waitUntil(promise: Promise<unknown>) {
        scheduled = promise;
      },
    },
  };

  runInBackground(ctx, Promise.reject(new Error('smtp down')));

  assert.ok(scheduled);
  await assert.doesNotReject(scheduled);
});

test('resolveEmailApi auto-detects configured providers', () => {
  assert.equal(resolveEmailApi({}), null);

  const resend = resolveEmailApi({ RESEND_API_KEY: 're_test' });
  assert.equal(resend?.provider, 'resend');
  assert.equal(resend?.apiKey, 're_test');

  const sendgrid = resolveEmailApi({ SENDGRID_API_KEY: 'sg_test' });
  assert.equal(sendgrid?.provider, 'sendgrid');

  const brevo = resolveEmailApi({ BREVO_API_KEY: 'xkeysib-test' });
  assert.equal(brevo?.provider, 'brevo');
});

test('resolveEmailApi honors explicit provider and requires its credentials', () => {
  assert.equal(resolveEmailApi({ EMAIL_API_PROVIDER: 'resend' })?.provider, undefined);
  assert.equal(resolveEmailApi({ EMAIL_API_PROVIDER: 'resend' })?.apiKey, undefined);

  const mailgun = resolveEmailApi({
    EMAIL_API_PROVIDER: 'mailgun',
    MAILGUN_API_KEY: 'key',
    MAILGUN_DOMAIN: 'mg.example.com',
  });
  assert.equal(mailgun?.provider, 'mailgun');
  assert.equal(mailgun?.domain, 'mg.example.com');

  assert.equal(resolveEmailApi({ EMAIL_API_PROVIDER: 'mailgun', MAILGUN_API_KEY: 'key' }), null);
});

test('resolveEmailApi supports the Cloudflare send_email binding', () => {
  const binding = { send: async () => ({}) };
  const config = resolveEmailApi({ EMAIL_API_PROVIDER: 'cloudflare', EMAIL: binding });
  assert.equal(config?.provider, 'cloudflare');
  assert.equal(config?.sendBinding, binding);
});
