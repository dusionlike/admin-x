import { Module } from "@nestjs/common";

import { DatabaseModule } from "../database/database.module.js";
import { UsersController } from "./users.controller.js";
import { UsersService } from "./users.service.js";

@Module({
  controllers: [UsersController],
  imports: [DatabaseModule],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
