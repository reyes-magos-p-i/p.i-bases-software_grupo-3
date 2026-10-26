import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { UpdateClientProfileDto } from './client-profile.dto';
import {
  ConfirmClientEmailChangeDto,
  RequestClientEmailChangeDto,
} from './client-email-change.dto';

describe('Client profile validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const validate = (value: unknown, metatype = UpdateClientProfileDto) =>
    pipe.transform(value, { type: 'body', metatype });

  it('reuses CRUD normalization and accepts only editable profile fields', async () => {
    await expect(
      validate({
        firstName: '  María  ',
        secondName: '',
        gender: null,
        phoneNumber: '+506 8888-7777',
        address: { districtId: 2, details: 'Cerca del cine' },
      }),
    ).resolves.toMatchObject({
      firstName: 'María',
      secondName: null,
      gender: null,
      phoneNumber: '88887777',
    });
  });
  it.each(['M', 'F', 'O', 'N', null])(
    'accepts existing gender %p',
    async (gender) => {
      await expect(validate({ gender })).resolves.toMatchObject({ gender });
    },
  );
  it.each([
    { firstName: '' },
    { firstName: null },
    { firstName: 'Ana1' },
    { firstName: 'Ana!' },
    { secondName: '123' },
    { firstSurname: 'Rojas@' },
    { secondSurname: 'A'.repeat(101) },
    { firstName: '\uD800' },
    { phoneNumber: '22223333' },
    { phoneNumber: 88887777 },
    { gender: 'X' },
    { gender: 1 },
    { address: [] },
    { address: { districtId: 0 } },
    { address: { districtId: 1.5 } },
    { address: { districtId: 2, details: 'á'.repeat(128) } },
    { address: { districtId: 2, extra: true } },
    { email: 'other@example.com' },
    { id: 2 },
    { clientId: 2 },
    { role: 'ADMINISTRATOR' },
    { status: 'INACTIVE' },
    { birthday: '2000-01-01' },
    { language: 'en' },
    { password: 'secret' },
  ])('rejects invalid or forbidden profile input %p', async (input) => {
    await expect(validate(input)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('permits clearing optional fields without changing registration requirements', async () => {
    await expect(
      validate({
        secondName: null,
        firstSurname: null,
        secondSurname: null,
        phoneNumber: null,
        address: null,
      }),
    ).resolves.toMatchObject({ address: null, phoneNumber: null });
  });
  it('normalizes the new email using the creation validator', async () => {
    await expect(
      pipe.transform(
        { email: ' NEW@Example.com ' },
        { type: 'body', metatype: RequestClientEmailChangeDto },
      ),
    ).resolves.toMatchObject({ email: 'new@example.com' });
  });
  it.each([
    {},
    { email: null },
    { email: 'invalid' },
    { email: '\uD800@example.com' },
    { email: 'a'.repeat(151) + '@example.com' },
    { email: 'a@example.com', clientId: 2 },
  ])('rejects invalid email input %p', async (input) => {
    await expect(
      pipe.transform(input, {
        type: 'body',
        metatype: RequestClientEmailChangeDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    {},
    { token: 'invalid' },
    { token: 1 },
    { token: 'a'.repeat(4097) },
  ])('rejects malformed confirmation %p', async (input) => {
    await expect(
      pipe.transform(input, {
        type: 'body',
        metatype: ConfirmClientEmailChangeDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
