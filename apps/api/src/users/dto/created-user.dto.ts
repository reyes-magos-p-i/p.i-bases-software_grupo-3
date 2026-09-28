import { UserRole } from '../enums/user-role.enum';

export class CreatedUserDto {
  readonly id: number;
  readonly role: UserRole;
  readonly email: string;

  constructor(user: { id: number; role: UserRole; email: string }) {
    this.id = user.id;
    this.role = user.role;
    this.email = user.email;
  }
}
