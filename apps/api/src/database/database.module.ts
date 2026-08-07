import { Global, Module } from "@nestjs/common";

import { DATABASE_PATH, DatabaseService, resolveDatabasePath } from "./database.service.js";

@Global()
@Module({
  exports: [DatabaseService],
  providers: [
    DatabaseService,
    {
      provide: DATABASE_PATH,
      useFactory: resolveDatabasePath,
    },
  ],
})
export class DatabaseModule {}
