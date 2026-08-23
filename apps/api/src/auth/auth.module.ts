import { Global, Module } from "@nestjs/common";
import nodemailer from "nodemailer";

import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthGuard } from "./auth.guard.js";
import { AdminPrivilegeGuard } from "./admin-privilege.guard.js";
import { EMAIL_TRANSPORT_FACTORY, EmailMfaService } from "./email-mfa.service.js";
import type { EmailTransportConfig, EmailTransportFactory } from "./email-mfa.service.js";
import { PermissionGuard } from "./permission.guard.js";
import { SensitiveActionGuard } from "./sensitive-action.guard.js";
import { AuthService } from "./auth.service.js";

@Global()
@Module({
  controllers: [AuthController],
  imports: [UsersModule],
  providers: [
    AdminPrivilegeGuard,
    AuthGuard,
    AuthService,
    EmailMfaService,
    PermissionGuard,
    SensitiveActionGuard,
    {
      provide: EMAIL_TRANSPORT_FACTORY,
      useFactory: (): EmailTransportFactory => (config: EmailTransportConfig) =>
        nodemailer.createTransport({
          auth: config.user ? { pass: config.password, user: config.user } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          host: config.host,
          port: config.port,
          requireTLS: !config.secure,
          secure: config.secure,
          socketTimeout: 10_000,
        }),
    },
  ],
  exports: [
    AdminPrivilegeGuard,
    AuthGuard,
    AuthService,
    EmailMfaService,
    PermissionGuard,
    SensitiveActionGuard,
  ],
})
export class AuthModule {}
