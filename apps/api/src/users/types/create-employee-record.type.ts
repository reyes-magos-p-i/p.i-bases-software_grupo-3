import type { PasswordHashResult } from '../../common/security/password-hasher';
import type { CreateEmployeeDto } from '../dto/create-employee.dto';

export type CreateEmployeeRecord = CreateEmployeeDto & PasswordHashResult;
