import { IsBoolean } from 'class-validator';

export class UpdateClientPromotionalEmailsDto {
  @IsBoolean({ message: 'Indica si deseas recibir anuncios por correo.' })
  enabled: boolean;
}
