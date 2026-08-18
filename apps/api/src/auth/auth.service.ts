import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import jwt from "jsonwebtoken";

import type {
  AuthUser,
  LoginRequest,
  LoginResponse,
  SetupAdminRequest,
  SetupStatus,
} from "@admin-x/shared";

import { verifyPassword } from "./password.js";
import { UsersService } from "../users/users.service.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "admin-x-development-secret";
const TOKEN_TTL_SECONDS = 8 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  getSetupStatus(): SetupStatus {
    return { needsSetup: this.usersService.count() === 0 };
  }

  setupAdmin(input: SetupAdminRequest): LoginResponse {
    const user = this.usersService.createAdmin(input);
    this.usersService.markLogin(user.id, user);
    return this.issueToken({
      avatar: user.avatar,
      displayName: user.displayName,
      email: user.email,
      id: user.id,
      lastLoginAt: new Date().toISOString(),
      remark: user.remark,
      role: user.role,
      username: user.username,
    });
  }

  login(input: LoginRequest): LoginResponse {
    const credentials = this.usersService.findCredentials(input.username);
    if (!credentials || !verifyPassword(input.password, credentials.passwordHash)) {
      throw new UnauthorizedException("用户名或密码错误");
    }
    const authenticatedUser = this.usersService.findAuthenticatedUser(credentials.user.id);
    if (!authenticatedUser || authenticatedUser.status !== "active") {
      throw new UnauthorizedException(
        authenticatedUser?.status === "suspended" ? "账号已停用" : "账号尚未激活",
      );
    }

    this.usersService.markLogin(credentials.user.id, credentials.user);
    return this.issueToken({ ...credentials.user, lastLoginAt: new Date().toISOString() });
  }

  authenticate(token: string): AuthUser {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (typeof payload === "string" || !payload.sub) {
        throw new Error("Invalid token payload");
      }

      const authenticatedUser = this.usersService.findAuthenticatedUser(String(payload.sub));
      if (!authenticatedUser || authenticatedUser.status !== "active") {
        throw new Error("Account not found or inactive");
      }
      return authenticatedUser.user;
    } catch {
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
  }

  private issueToken(user: AuthUser): LoginResponse {
    const token = jwt.sign({ role: user.role, username: user.username }, JWT_SECRET, {
      expiresIn: TOKEN_TTL_SECONDS,
      subject: user.id,
    });

    return {
      expiresIn: TOKEN_TTL_SECONDS,
      token,
      user,
    };
  }
}
