import { HttpException, Inject, Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { catchError, tap, throwError } from "rxjs";

import type { AuditRecord } from "@admin-x/shared";

import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedRequest } from "../auth/auth.guard.js";
import { getAuditContext } from "../auth/request-context.js";

@Injectable()
export class RequestAuditInterceptor implements NestInterceptor {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const path = this.getPath(request);

    if (request.method === "OPTIONS" || this.isHealthProbe(path)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        this.record(request, response.statusCode, path);
      }),
      catchError((error: unknown) => {
        this.record(request, this.getErrorStatus(error, response), path);
        return throwError(() => error);
      }),
    );
  }

  private record(request: AuthenticatedRequest, status: number, path: string): void {
    const success = status >= 200 && status < 400;
    const method = request.method.toUpperCase();
    const result = this.getResult(status, success);
    const actor = request.user;

    this.database.addActivity({
      action: success ? "api.request" : "api.request.failure",
      actor: actor
        ? {
            displayName: actor.displayName,
            id: actor.id,
            role: actor.role,
            username: actor.username,
          }
        : undefined,
      actorName: actor ? undefined : "未认证请求",
      context: getAuditContext(request),
      description: `${method} ${path} 返回 HTTP ${status}`,
      result,
      title: success ? "API 请求" : "API 请求失败",
      type: method === "GET" ? "system" : method === "POST" ? "create" : "update",
      resource: path,
    });
  }

  private getErrorStatus(error: unknown, response: Response): number {
    if (error instanceof HttpException) {
      return error.getStatus();
    }
    return response.statusCode >= 400 ? response.statusCode : 500;
  }

  private getPath(request: AuthenticatedRequest): string {
    const path = request.path || request.originalUrl.split("?", 1)[0];
    return (path || "/").slice(0, 300);
  }

  private getResult(status: number, success: boolean): AuditRecord["result"] {
    if (success) {
      return "success";
    }
    return [401, 403, 412, 426, 429].includes(status) ? "blocked" : "failure";
  }

  private isHealthProbe(path: string): boolean {
    const normalizedPath = path.replace(/^\/api/u, "");
    return normalizedPath === "/health" || normalizedPath === "/ready";
  }
}
