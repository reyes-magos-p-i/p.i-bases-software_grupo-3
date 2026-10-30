import { OmitType, PickType } from '@nestjs/mapped-types';
import { IsIn, IsOptional } from 'class-validator';
import { UpdateClientDto } from '../../users/dto/update-user.dto';

export class UpdateClientProfileDto extends OmitType(UpdateClientDto, [
  'email',
] as const) {
  @IsOptional()
  @IsIn(['M', 'F', 'O', 'N'], {
    message: 'Selecciona una opción de género válida.',
  })
  gender?: string | null;
}

export class DeactivateClientProfileDto extends PickType(
  UpdateClientProfileDto,
  [] as const,
) {}
