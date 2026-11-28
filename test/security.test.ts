import test from 'node:test';
import assert from 'node:assert/strict';
import { detectTeleportSpeedKmh, normalizeAntiFakeMode } from '../src/services/security';

test('normalizeAntiFakeMode defaults to block on unknown values', () => {
  assert.equal(normalizeAntiFakeMode('off'), 'off');
  assert.equal(normalizeAntiFakeMode('warn_and_log'), 'warn_and_log');
  assert.equal(normalizeAntiFakeMode('block'), 'block');
  assert.equal(normalizeAntiFakeMode('invalid'), 'block');
});

test('detectTeleportSpeedKmh flags impossible travel speed between Jakarta and Surabaya', () => {
  // ~660 km apart in 5 minutes -> ~7920 km/h
  const res = detectTeleportSpeedKmh(-6.2088, 106.8456, '08:30:00', -7.2575, 112.7521, '08:35:00');
  assert.ok(res);
  assert.ok(res.distanceMeters > 600_000);
  assert.ok(res.speedKmh > 5000);

  // Short ~100m walk in 10 minutes -> < 1 km/h
  const normal = detectTeleportSpeedKmh(-6.2088, 106.8456, '08:30:00', -6.2095, 106.8460, '08:40:00');
  assert.ok(normal);
  assert.ok(normal.speedKmh < 5);
});
