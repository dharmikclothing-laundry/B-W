import {normalizePhone} from './contactValidation';
test('normalizes and validates verified login phone format', () => {
  expect(normalizePhone('91 99999 99999')).toBe('+919999999999');
  expect(() => normalizePhone('123')).toThrow();
  expect(() => normalizePhone('+0000000000')).toThrow();
});
