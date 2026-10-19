import { applyDecorators } from '@nestjs/common';
import { IsInt, IsPositive } from 'class-validator';

export function IsFK() {
    return applyDecorators(
        IsPositive(),
        IsInt(),
    );
}
