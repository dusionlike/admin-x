import { ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata, Type } from "@nestjs/common";
import * as classTransformer from "class-transformer";
import * as classValidator from "class-validator";

export class DtoValidationPipe extends ValidationPipe {
  constructor(private readonly dtoClass: Type<unknown>) {
    super({
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transformerPackage: classTransformer,
      transform: true,
      validatorPackage: classValidator,
      whitelist: true,
    });
  }

  override transform(value: unknown, metadata: ArgumentMetadata) {
    return super.transform(value, { ...metadata, metatype: this.dtoClass });
  }
}
