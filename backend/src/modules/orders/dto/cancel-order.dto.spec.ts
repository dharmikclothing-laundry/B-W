import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CancelOrderDto } from './cancel-order.dto';

async function validateReason(value: unknown) {
  return validate(
    plainToInstance(CancelOrderDto, {
      reason: value,
    }),
  );
}

describe('CancelOrderDto', () => {
  it('accepts and trims a meaningful cancellation reason', async () => {
    const dto = plainToInstance(CancelOrderDto, {
      reason: '  Pickup is no longer needed  ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.reason).toBe('Pickup is no longer needed');
  });

  it.each([undefined, null, '', '  ', 'no', 123])(
    'rejects invalid cancellation reason %p',
    async (reason) => {
      await expect(validateReason(reason)).resolves.not.toEqual([]);
    },
  );

  it('rejects cancellation reasons longer than 500 characters', async () => {
    await expect(validateReason('x'.repeat(501))).resolves.not.toEqual([]);
  });
});
