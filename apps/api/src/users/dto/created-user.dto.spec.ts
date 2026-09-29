import { UserRole } from '../enums/user-role.enum';
import { CreatedUserDto } from './created-user.dto';

describe('CreatedUserDto', () => {
  it.each([UserRole.CLIENT, UserRole.EMPLOYEE, UserRole.ADMINISTRATOR])(
    'returns only the public creation result for %s',
    (role) => {
      const user = {
        id: 42,
        role,
        email: 'persona@example.com',
        password: 'test-password',
        passwordHash: 'test-hash',
        salt: 'test-salt',
        firstName: 'Ana',
        phoneNumber: '88888888',
      };

      const response = new CreatedUserDto(user);

      expect({ ...response }).toEqual({
        id: 42,
        role,
        email: 'persona@example.com',
      });
      expect(JSON.stringify(response)).toBe(
        JSON.stringify({ id: 42, role, email: 'persona@example.com' }),
      );
    },
  );
});
