import { IsString, IsNumber, IsOptional, ValidateNested, Type, IsArray } from 'class-validator';

export class OracleHooksPayloadDto {
  @IsString()
  price!: string;

  @IsNumber()
  timestamp!: number;

  @IsString()
  @IsOptional()
  source?: string;

  @ValidateNested({ each: true })
  @IsArray()
  @IsOptional()
  @Type(() => OraclePriceDataDto)
  data?: OraclePriceDataDto[];
}

export class OraclePriceDataDto {
  @IsString()
  asset!: string;

  @IsString()
  value!: string;

  @IsNumber()
  @IsOptional()
  confidence?: number;
}
