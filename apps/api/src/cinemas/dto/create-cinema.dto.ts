import { IsCinemaName } from '../../common/validation/cinema-name.decorator';
import { IsFK } from '../../common/validation/fk.decorator';

export class CreateCinemaDto {
    @IsCinemaName()
    name: string;
    @IsFK()
    companyId: number;
}
