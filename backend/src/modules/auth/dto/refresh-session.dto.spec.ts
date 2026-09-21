import { validate } from 'class-validator';
import { RefreshSessionDto } from './refresh-session.dto';

async function validateRefreshToken(value: unknown) {
  const dto = new RefreshSessionDto();
  (dto as { refreshToken: unknown }).refreshToken = value;
  return validate(dto);
}

describe('RefreshSessionDto', () => {
  it('accepts a non-empty refresh token', async () => {
    await expect(validateRefreshToken('test-refresh-token')).resolves.toEqual([]);
  });

  it.each([undefined, null, '', 123])('rejects an invalid refresh token', async value => {
    await expect(validateRefreshToken(value)).resolves.not.toEqual([]);
  });

  it('rejects an oversized refresh token', async () => {
    await expect(validateRefreshToken('x'.repeat(4097))).resolves.not.toEqual([]);
  });
});
