import { formatCountdownMs, datetimeLocalToIso, isoToDatetimeLocal } from './countdown';

test('formatCountdownMs', () => {
  expect(formatCountdownMs(86400000 + 3661000)).toMatch(/1d/);
  expect(formatCountdownMs(3600000)).toContain('1h');
  expect(formatCountdownMs(65000)).toContain('1m');
  expect(formatCountdownMs(0)).toBe('0s');
});

test('datetime round-trip preserves instant', () => {
  const iso = '2028-06-15T18:30:00.000Z';
  const local = isoToDatetimeLocal(iso);
  expect(local).toBeTruthy();
  const back = datetimeLocalToIso(local);
  expect(new Date(back).getTime()).toBe(new Date(iso).getTime());
});
