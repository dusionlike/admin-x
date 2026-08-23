import type {
  EmailMfaPolicyStatus,
  EmailMfaSettings,
  SecurityPolicy,
  UpdateEmailMfaPolicy,
  UpdateEmailMfaTransportSettings,
} from "@admin-x/shared";

import { requestData } from "./http";

export const securityApi = {
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
