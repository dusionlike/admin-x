import type {
  BackupRecord,
  BackupTarget,
  BackupVerification,
  ComplianceOverview,
  VulnerabilityScanRecord,
} from "@admin-x/shared";

import { requestData } from "./http";

export const complianceApi = {
  getOverview() {
    return requestData<ComplianceOverview>({ method: "GET", url: "/compliance/overview" });
  },
  listBackups() {
    return requestData<BackupRecord[]>({ method: "GET", url: "/compliance/backups" });
  },
  createBackup(target: BackupTarget) {
    return requestData<BackupRecord>({
      data: { target },
      method: "POST",
      url: "/compliance/backups",
    });
  },
  verifyBackup(id: string) {
    return requestData<BackupVerification>({
      method: "POST",
      url: `/compliance/backups/${id}/verify`,
    });
  },
  listVulnerabilityScans() {
    return requestData<VulnerabilityScanRecord[]>({
      method: "GET",
      url: "/compliance/vulnerability-scans",
    });
  },
  recordVulnerabilityScan(payload: {
    criticalCount: number;
    highCount: number;
    lowCount: number;
    mediumCount: number;
    report?: string;
    scanner?: string;
  }) {
    return requestData<VulnerabilityScanRecord>({
      data: payload,
      method: "POST",
      url: "/compliance/vulnerability-scans",
    });
  },
};
