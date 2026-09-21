import {validate} from 'class-validator';
import {UpdateCustomerDto} from './customer.dto';

describe('customer profile name validation', () => {
  it('accepts a normal name', async () => {
    const dto = new UpdateCustomerDto(); dto.fullName = 'Asha Reddy';
    expect(await validate(dto)).toHaveLength(0);
  });
  it.each(['A', '12345', '', '  '])('rejects invalid name %p', async name => {
    const dto = new UpdateCustomerDto(); dto.fullName = name;
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
