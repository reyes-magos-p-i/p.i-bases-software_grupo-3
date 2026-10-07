import { IsInt, Max, Min } from 'class-validator';
import { ToInteger } from './query-transforms';

const MESSAGE = 'El identificador de la proyección debe ser un número entero positivo.';

export class ProjectionIdParamsDto {
  @ToInteger()
  @IsInt({ message: MESSAGE })
  @Min(1, { message: MESSAGE })
  @Max(Number.MAX_SAFE_INTEGER, { message: MESSAGE })
  id: number;
}
