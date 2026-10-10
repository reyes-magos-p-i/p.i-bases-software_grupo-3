import { applyDecorators } from '@nestjs/common';
import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export const CINEMA_NAME_MAX_LENGTH = 150;

export function IsCinemaName() {
    return applyDecorators(
        IsString(),
        IsNotEmpty(),
        Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
        MaxLength(CINEMA_NAME_MAX_LENGTH),
    );
}
