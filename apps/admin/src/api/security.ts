import type {
  EmailMfaPolicyStatus,
  EmailMfaSettings,
  IntegrityInspection,
  ResourceSecurityLabel,
  SecurityPolicy,
  UpdateEmailMfaPolicy,
  UpdateEmailMfaTransportSettings,
  UpdateResourceSecurityLabelRequest,
} from "@admin-x/shared";

import { requestData } from "./http";

export const securityApi = {
  getIntegrityInspection() {
    return requestData<IntegrityInspection>({
      method: "GET",
      url: "/security/integrity",
    });
  },
  getResourceSecurityLabels() {
    return requestData<ResourceSecurityLabel[]>({
      method: "GET",
      url: "/security/resource-labels",
    });
  },
  updateResourceSecurityLabel(resource: string, payload: UpdateResourceSecurityLabelRequest) {
    return requestData<ResourceSecurityLabel>({
      data: payload,
      method: "PATCH",
      url: `/security/resource-labels/${resource}`,
    });
  },
  getPolicy() {
    return requestData<SecurityPolicy>({
      method: "GET",
      url: "/security/policy",
    });
  },
  updatePolicy(payload: SecurityPolicy) {
    return requestData<SecurityPolicy>({
      data: payload,
      method: "PATCH",
      url: "/security/policy",
    });
  },
  getEmailMfaSettings() {
    return requestData<EmailMfaSettings>({
      method: "GET",
      url: "/security/email-mfa",
    });
  },
  updateEmailMfaTransport(payload: UpdateEmailMfaTransportSettings) {
    return requestData<EmailMfaSettings>({
      data: payload,
      method: "PATCH",
      url: "/security/email-mfa/transport",
    });
  },
  testEmailMfa() {
    return requestData<{ maskedEmail: string }>({
      method: "POST",
      url: "/security/email-mfa/test",
    });
  },
  getEmailMfaPolicy() {
    return requestData<EmailMfaPolicyStatus>({
      method: "GET",
      url: "/security/email-mfa/policy",
    });
  },
  updateEmailMfaPolicy(payload: UpdateEmailMfaPolicy) {
    return requestData<EmailMfaPolicyStatus>({
      data: payload,
      method: "PATCH",
      url: "/security/email-mfa/policy",
    });
  },
};
