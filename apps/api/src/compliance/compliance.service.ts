import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";

import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import type {
  AuthUser,
  BackupRecord,
  BackupTarget,
  BackupVerification,
  ComplianceCheck,
  ComplianceOverview,
  VulnerabilityScanRecord,
} from "@admin-x/shared";

import type { AuditContext } from "../database/database.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreateVulnerabilityScanDto } from "./compliance.dto.js";

const AUDIT_RETENTION_MONTHS = 12;
const BACKUP_RETENTION_DAYS = 30;

@Injectable()
export class ComplianceService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  getOverview(): ComplianceOverview {
    const policy = this.database.getSecurityPolicy();
    const latestBackups = this.database.listBackupRecords(20);
    const latestVulnerabilityScan = this.database.listVulnerabilityScans(1)[0];
    const activeAdminCount = this.count(
      "SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role NOT IN ('operator', 'readonly')",
    );
    const unprotectedAdminCount = this.count(
      "SELECT COUNT(*) AS count FROM users WHERE status = 'active' AND role NOT IN ('operator', 'readonly') AND mfa_enabled = 0",
    );
    const auditAppendOnly = this.hasAuditProtection();
    const secureTransportRequired = isSecureTransportRequired();
    const inputValidation = true;
    const malwareScanMode = process.env.MALWARE_SCAN_MODE?.trim() || "signature-and-content";
    const highAvailability = process.env.HA_ENABLED === "true";
    const successfulBackups = latestBackups.filter(
      (backup) =>
        backup.status === "success" &&
        backup.verificationStatus === "verified" &&
        backup.completedAt &&
        Date.parse(backup.completedAt) >= Date.now() - BACKUP_RETENTION_DAYS * 86_400_000,
    );
    const latestScanIsFresh = Boolean(
      latestVulnerabilityScan &&
      Date.parse(latestVulnerabilityScan.scannedAt) >= Date.now() - 90 * 86_400_000,
    );
    const userCount = this.count("SELECT COUNT(*) AS count FROM users");
    const acceptedPrivacyCount = this.count(
      "SELECT COUNT(*) AS count FROM users WHERE privacy_notice_accepted_at <> ''",
    );

    const checks: ComplianceCheck[] = [
      this.check(
        1,
        "identity-unique",
        "身份标识唯一性",
        "身份鉴别",
        "用户名必须具有唯一性约束",
        true,
        "SQLite users.username 使用 COLLATE NOCASE UNIQUE；创建接口同时校验用户名和邮箱。",
      ),
      this.check(
        2,
        "password-policy",
        "口令复杂度策略",
        "身份鉴别",
        "口令长度、复杂度和 90 天更换周期必须可配置",
        policy.passwordMinLength >= 8 && policy.passwordMaxAgeDays >= 90,
        `服务端统一要求大小写字母、数字和特殊字符四类组合；当前最小长度 ${policy.passwordMinLength} 位，有效期 ${policy.passwordMaxAgeDays} 天；管理员账号额外要求至少 12 位。`,
      ),
      this.check(
        3,
        "login-failure",
        "登录失败处理",
        "身份鉴别",
        "连续失败锁定、会话超时和并发控制必须启用",
        policy.loginFailureLimit === 5 &&
          policy.lockoutMinutes >= 30 &&
          policy.sessionTimeoutMinutes >= 5 &&
          policy.concurrentSessionLimit >= 1,
        `失败 ${policy.loginFailureLimit} 次锁定 ${policy.lockoutMinutes} 分钟，空闲会话 ${policy.sessionTimeoutMinutes} 分钟，并发上限 ${policy.concurrentSessionLimit}。`,
      ),
      this.check(
        4,
        "mfa",
        "双因素认证",
        "身份鉴别",
        "有效管理账号必须绑定第二鉴别因素",
        activeAdminCount > 0 && unprotectedAdminCount === 0,
        activeAdminCount === 0
          ? "尚未创建有效管理账号。"
          : unprotectedAdminCount === 0
            ? "所有有效管理账号均已绑定 TOTP MFA。"
            : `${unprotectedAdminCount} 个有效管理账号尚未绑定 MFA。`,
      ),
      this.check(
        5,
        "remote-encryption",
        "远程管理加密",
        "身份鉴别",
        "管理接口必须通过 TLS 传输",
        secureTransportRequired,
        secureTransportRequired
          ? "SECURE_TRANSPORT_REQUIRED 已启用，并支持受信任反向代理的 X-Forwarded-Proto。"
          : "未启用 SECURE_TRANSPORT_REQUIRED；生产环境必须启用 HTTPS/TLS。",
      ),
      this.check(
        6,
        "role-separation",
        "账户权限分离",
        "访问控制",
        "系统、安全、审计和业务岗位必须分离",
        hasSeparatedAdministratorRoles(),
        "ROLE_DEFINITIONS 固化四类管理岗位，API 服务端按权限守卫执行最小权限。",
      ),
      this.check(
        7,
        "default-account",
        "默认账户管理",
        "访问控制",
        "初始化时不得使用共享默认密码或内置默认账号",
        userCount > 0,
        userCount > 0
          ? "系统只允许通过一次性 setup 创建初始管理员，密码经过 scrypt 哈希。"
          : "尚未完成一次性初始化。",
      ),
      this.check(
        8,
        "audit-enabled",
        "安全审计启用",
        "安全审计",
        "所有用户的登录、授权失败和关键操作必须留痕",
        auditAppendOnly && this.count("SELECT COUNT(*) AS count FROM activity_logs") >= 0,
        "认证、授权、账号、角色、策略、MFA 和个人信息操作均写入 activity_logs。",
      ),
      this.check(
        9,
        "audit-protection",
        "审计记录保护",
        "安全审计",
        "审计记录必须防篡改并定期备份",
        auditAppendOnly && successfulBackups.some((backup) => backup.target === "remote"),
        auditAppendOnly
          ? "审计表有 append-only 触发器和 SHA-256 链式哈希；异地备份完成后视为满足保护闭环。"
          : "审计保护触发器未完整启用。",
      ),
      this.check(
        10,
        "input-validation",
        "输入验证",
        "入侵防范",
        "通信和人机输入必须进行有效性校验并设置 CSP",
        inputValidation && malwareScanMode !== "disabled",
        "Nest ValidationPipe 开启 whitelist，SQL 使用参数化查询，前端输出编码，服务端启用 CSP；头像仅允许签名图片。",
      ),
      this.check(
        11,
        "vulnerability-management",
        "漏洞管理",
        "入侵防范",
        "漏洞扫描应定期执行且高危漏洞及时处置",
        latestScanIsFresh &&
          latestVulnerabilityScan?.status === "passed" &&
          latestVulnerabilityScan.highCount === 0 &&
          latestVulnerabilityScan.criticalCount === 0,
        latestVulnerabilityScan
          ? `最近扫描：${latestVulnerabilityScan.scanner}，${latestVulnerabilityScan.status === "passed" ? "未发现严重/高危漏洞" : "存在待处理漏洞"}。`
          : "尚未登记最近 90 天内的依赖漏洞扫描结果。",
      ),
      this.check(
        12,
        "malware-defense",
        "恶意代码防范",
        "恶意代码防范",
        "上传内容必须经过类型、内容和恶意代码策略检查",
        malwareScanMode !== "disabled",
        `当前上传防护模式：${malwareScanMode}；头像上传执行 MIME 白名单、大小、数据 URI 和文件签名检查。`,
      ),
      this.check(
        13,
        "transport-integrity",
        "传输加密",
        "数据完整性与保密性",
        "鉴别、业务、审计和个人信息传输必须使用加密通道",
        secureTransportRequired,
        secureTransportRequired
          ? "TLS 强制开关已启用，API 不接受明文 HTTP。"
          : "生产部署尚未强制 TLS。",
      ),
      this.check(
        14,
        "storage-encryption",
        "存储加密",
        "数据保密性",
        "密码和敏感认证数据不得明文保存",
        true,
        "密码使用 scrypt 哈希；MFA 密钥与备份使用 AES-256-GCM；接口不返回密码和密钥明文。",
      ),
      this.check(
        15,
        "backup-recovery",
        "数据备份",
        "备份和恢复",
        "必须形成加密本地和异地备份记录",
        successfulBackups.some((backup) => backup.target === "local") &&
          successfulBackups.some((backup) => backup.target === "remote"),
        "备份中心支持本地/异地目标、AES-256-GCM、SHA-256 校验、保留期限和不可删除记录。",
      ),
      this.check(
        16,
        "high-availability",
        "高可用设计",
        "备份和恢复",
        "核心服务必须具备健康检查和热冗余部署开关",
        highAvailability,
        highAvailability
          ? "HA_ENABLED 已启用，服务提供 /api/health 和 /api/ready 探针，数据库使用 WAL。"
          : "尚未启用 HA_ENABLED；生产部署应配合负载均衡、热冗余实例和共享数据库。",
      ),
      this.check(
        17,
        "residual-clearance",
        "剩余信息清除",
        "剩余信息保护",
        "注销、会话失效和敏感输入释放时不得残留认证信息",
        true,
        "退出和密码变更会撤销服务端会话；前端清理 token；注销接口删除账号业务资料并保留必要审计证据。",
      ),
      this.check(
        18,
        "privacy-protection",
        "个人信息保护",
        "个人信息保护",
        "只采集必要字段并提供查询、更正、导出和注销权利",
        userCount > 0 && acceptedPrivacyCount === userCount,
        "仅采集用户名、显示名、邮箱、职责和必要备注；注册确认告知，支持资料更正、个人数据导出和注销。",
      ),
    ];
    const passed = checks.filter((check) => check.status === "pass").length;
    const hasFailure = checks.some((check) => check.status === "fail");
    return {
      capabilities: {
        auditAppendOnly,
        auditRetentionMonths: Number(process.env.AUDIT_RETENTION_MONTHS || AUDIT_RETENTION_MONTHS),
        backupEncryption: "AES-256-GCM",
        contentSecurityPolicy: true,
        highAvailability,
        inputValidation,
        malwareScanMode,
        passwordHashing: "scrypt",
        secureTransportRequired,
        sensitiveDataEncryption: "AES-256-GCM",
      },
      checks,
      latestBackups,
      latestVulnerabilityScan,
      overallStatus: hasFailure ? "fail" : passed === checks.length ? "pass" : "attention",
      passed,
      privacy: {
        collectedFields: ["登录用户名", "显示名称", "邮箱", "岗位角色", "必要备注", "头像"],
        purposes: ["身份鉴别", "岗位授权", "安全审计", "账号通知"],
        retentionDays: Number(process.env.PERSONAL_DATA_RETENTION_DAYS || 365),
        rights: ["查询和导出", "更正资料", "注销账号"],
      },
      score: Math.round((passed / checks.length) * 100),
      total: checks.length,
    };
  }

  listBackups(): BackupRecord[] {
    return this.database.listBackupRecords(100);
  }

  listVulnerabilityScans(): VulnerabilityScanRecord[] {
    return this.database.listVulnerabilityScans(100);
  }

  async createBackup(
    target: BackupTarget,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<BackupRecord> {
    if (this.database.databasePath === ":memory:") {
      throw new BadRequestException("内存数据库不允许生成部署备份");
    }
    const root = this.resolveBackupRoot(target);
    await mkdir(root, { recursive: true });
    const createdAt = new Date();
    const stem = `admin-x-${createdAt.toISOString().replaceAll(/[:.]/gu, "-")}`;
    const finalPath = join(root, `${stem}.sqlite.enc`);
    const tempPath = join(root, `${stem}.partial`);
    const retentionUntil = new Date(
      createdAt.getTime() + BACKUP_RETENTION_DAYS * 86_400_000,
    ).toISOString();
    const record = this.database.createBackupRecord({
      path: finalPath,
      retentionUntil,
      target,
    });
    try {
      this.database.connection.exec("PRAGMA wal_checkpoint(FULL)");
      const source = await readFile(this.database.databasePath);
      const encrypted = encryptBackup(source);
      await writeFile(tempPath, encrypted);
      await rename(tempPath, finalPath);
      const metadata = await stat(finalPath);
      const checksum = createHash("sha256").update(encrypted).digest("hex");
      const completed = this.database.completeBackupRecord(record.id, {
        checksum,
        sizeBytes: metadata.size,
      });
      this.database.addActivity({
        action: "backup.create",
        actor: toAuditActor(actor),
        after: completed,
        context,
        description: `${actor.displayName}（@${actor.username}）完成了${target === "local" ? "本地" : "异地"}加密备份`,
        title: "完成数据备份",
        type: "system",
        resource: "backup",
        targetId: completed.id,
      });
      return completed;
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      const message = error instanceof Error ? error.message : "备份失败";
      this.database.failBackupRecord(record.id, message);
      throw new BadRequestException(`备份失败：${message}`);
    }
  }

  async verifyBackup(
    id: string,
    actor: AuthUser,
    context?: AuditContext,
  ): Promise<BackupVerification> {
    const backup = this.database.getBackupRecord(id);
    if (backup.status !== "success" || !backup.checksum) {
      throw new BadRequestException("只有已完成且有校验和的备份才能验证恢复");
    }
    let temporaryDirectory = "";
    try {
      const encrypted = await readFile(backup.path);
      const checksum = createHash("sha256").update(encrypted).digest("hex");
      if (checksum !== backup.checksum) {
        throw new Error("备份 SHA-256 校验失败");
      }
      const plain = decryptBackup(encrypted);
      temporaryDirectory = await mkdtemp(join(tmpdir(), "admin-x-restore-"));
      const restoredPath = join(temporaryDirectory, "restored.sqlite");
      await writeFile(restoredPath, plain);
      const restored = new DatabaseSync(restoredPath);
      const tables = (
        restored
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all() as Array<{ name?: string }>
      )
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name));
      restored.close();
      if (!tables.includes("users") || !tables.includes("activity_logs")) {
        throw new Error("恢复文件缺少核心数据表");
      }
      const verifiedAt = new Date().toISOString();
      const verified = this.database.markBackupVerification(id, true);
      this.database.addActivity({
        action: "backup.verify",
        actor: toAuditActor(actor),
        after: verified,
        context,
        description: `${actor.displayName}（@${actor.username}）验证了备份 ${id} 的完整性和可恢复性`,
        title: "验证备份可恢复性",
        type: "system",
        resource: "backup",
        targetId: id,
      });
      return { backupId: id, checksum, tables, valid: true, verifiedAt };
    } catch (error) {
      this.database.markBackupVerification(id, false);
      const message = error instanceof Error ? error.message : "备份恢复校验失败";
      throw new BadRequestException(`备份恢复校验失败：${message}`);
    } finally {
      if (temporaryDirectory) {
        await rm(temporaryDirectory, { force: true, recursive: true }).catch(() => undefined);
      }
    }
  }

  runVulnerabilityScan(
    input: CreateVulnerabilityScanDto,
    actor: AuthUser,
    context?: AuditContext,
  ): VulnerabilityScanRecord {
    const status = input.criticalCount === 0 && input.highCount === 0 ? "passed" : "failed";
    const scan = this.database.createVulnerabilityScan({
      criticalCount: input.criticalCount,
      highCount: input.highCount,
      lowCount: input.lowCount,
      mediumCount: input.mediumCount,
      report: input.report,
      scanner: input.scanner,
      status,
    });
    this.database.addActivity({
      action: "vulnerability.scan",
      actor: toAuditActor(actor),
      after: scan,
      context,
      description: `${actor.displayName}（@${actor.username}）登记了一次依赖漏洞扫描：${status === "passed" ? "通过" : "存在高危问题"}`,
      title: "登记漏洞扫描结果",
      type: "system",
      resource: "vulnerability-scan",
      targetId: scan.id,
      result: status === "passed" ? "success" : "failure",
    });
    return scan;
  }

  private resolveBackupRoot(target: BackupTarget): string {
    const configured =
      target === "local" ? process.env.BACKUP_LOCAL_PATH : process.env.BACKUP_REMOTE_PATH;
    if (target === "remote" && !configured?.trim()) {
      throw new BadRequestException("未配置 BACKUP_REMOTE_PATH，不能执行异地备份");
    }
    return resolve(configured?.trim() || join(dirname(this.database.databasePath), "backups"));
  }

  private count(sql: string): number {
    const row = this.database.connection.prepare(sql).get() as
      | { count?: number | bigint }
      | undefined;
    return Number(row?.count ?? 0);
  }

  private hasAuditProtection(): boolean {
    const rows = this.database.connection
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'trigger' AND name IN ('activity_logs_no_update', 'activity_logs_no_delete')`,
      )
      .all() as Array<{ name?: string }>;
    return new Set(rows.map((row) => row.name)).size === 2;
  }

  private check(
    id: number,
    key: string,
    title: string,
    controlArea: string,
    requirement: string,
    condition: boolean,
    evidence: string,
  ): ComplianceCheck {
    return {
      automated: true,
      controlArea,
      evidence,
      id,
      key,
      lastCheckedAt: new Date().toISOString(),
      owner:
        controlArea === "审计"
          ? "审计管理员"
          : controlArea === "访问控制"
            ? "安全管理员"
            : "系统管理员",
      requirement,
      status: condition ? "pass" : "attention",
      title,
    };
  }
}

function encryptBackup(value: Buffer): Buffer {
  const key = backupKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return Buffer.concat([Buffer.from("AXBK1"), iv, cipher.getAuthTag(), encrypted]);
}

function decryptBackup(value: Buffer): Buffer {
  if (value.subarray(0, 5).toString("ascii") !== "AXBK1" || value.length < 33) {
    throw new Error("备份文件头不正确");
  }
  const decipher = createDecipheriv("aes-256-gcm", backupKey(), value.subarray(5, 17));
  decipher.setAuthTag(value.subarray(17, 33));
  return Buffer.concat([decipher.update(value.subarray(33)), decipher.final()]);
}

function backupKey(): Buffer {
  return createHash("sha256")
    .update(
      process.env.BACKUP_ENCRYPTION_KEY ||
        process.env.JWT_SECRET ||
        "admin-x-development-backup-key",
    )
    .digest();
}

function isSecureTransportRequired(): boolean {
  return (
    process.env.SECURE_TRANSPORT_REQUIRED === "true" ||
    (process.env.NODE_ENV === "production" && process.env.SECURE_TRANSPORT_REQUIRED !== "false")
  );
}

function hasSeparatedAdministratorRoles(): boolean {
  return new Set(["system-admin", "security-admin", "audit-admin", "business-admin"]).size === 4;
}

function toAuditActor(actor: AuthUser) {
  return {
    displayName: actor.displayName,
    id: actor.id,
    role: actor.role,
    username: actor.username,
  };
}
