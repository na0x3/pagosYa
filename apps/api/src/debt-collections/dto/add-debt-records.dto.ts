import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from "class-validator";
import { DebtRecordInputDto } from "./create-debt-collection-link.dto";

export class AddDebtRecordsDto {
  @ApiProperty({ type: [DebtRecordInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => DebtRecordInputDto)
  debts!: DebtRecordInputDto[];
}
