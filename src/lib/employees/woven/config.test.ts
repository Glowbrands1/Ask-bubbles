import { describe, expect, it } from "vitest";

import { readWovenConfig } from "./config";

const COMPANY_ID = "55839F24-9241-418C-8405-37BAF9A42A87";

/** Configuration: off by default, credentials by name only, and no insecure base URL. */

describe("readWovenConfig", () => {
  it("is off, with the documented default base URL, when nothing is set", () => {
    const config = readWovenConfig({});
    expect(config.enabled).toBe(false);
    expect(config.validationEnabled).toBe(false);
    expect(config.scheduleEnabled).toBe(false);
    expect(config.baseUrl).toBe("https://gateway-api.woven.team/api");
    expect(config.credentials).toBeNull();
    expect(config.missingCredentials).toEqual(["WOVEN_SUBSCRIPTION_KEY", "WOVEN_USERNAME", "WOVEN_PASSWORD"]);
    expect(config.problems).toEqual([]);
  });

  it("reports a missing credential by NAME and never echoes a value", () => {
    const config = readWovenConfig({
      WOVEN_SYNC_ENABLED: "true",
      WOVEN_COMPANY_ID: COMPANY_ID,
      WOVEN_SUBSCRIPTION_KEY: "sk-live-very-secret-value",
      WOVEN_USERNAME: "ask-bubbles",
    });
    expect(config.credentials).toBeNull();
    expect(config.problems.join(" ")).toContain("WOVEN_PASSWORD");
    expect(JSON.stringify(config.problems)).not.toContain("sk-live-very-secret-value");
  });

  it("assembles credentials when all three are present", () => {
    const config = readWovenConfig({
      WOVEN_SUBSCRIPTION_KEY: " key ",
      WOVEN_USERNAME: " user ",
      WOVEN_PASSWORD: " pass with spaces ",
    });
    expect(config.credentials).toEqual({ subscriptionKey: "key", username: "user", password: " pass with spaces " });
  });

  it("reads the validation switch independently, and it never turns on a sync", () => {
    const creds = { WOVEN_SUBSCRIPTION_KEY: "k", WOVEN_USERNAME: "u", WOVEN_PASSWORD: "p" };
    const validationOnly = readWovenConfig({ ...creds, WOVEN_VALIDATION_ENABLED: "true", WOVEN_SYNC_ENABLED: "false" });
    expect(validationOnly.validationEnabled).toBe(true);
    expect(validationOnly.enabled).toBe(false);
    expect(validationOnly.scheduleEnabled).toBe(false);
    expect(validationOnly.problems).toEqual([]);

    const syncOnly = readWovenConfig({ ...creds, WOVEN_SYNC_ENABLED: "true", WOVEN_COMPANY_ID: COMPANY_ID });
    expect(syncOnly.enabled).toBe(true);
    expect(syncOnly.validationEnabled).toBe(false);
  });

  it("the write switch is off unless set, independent of the sync switch, and flagged when on alone", () => {
    const creds = { WOVEN_SUBSCRIPTION_KEY: "k", WOVEN_USERNAME: "u", WOVEN_PASSWORD: "p", WOVEN_COMPANY_ID: COMPANY_ID };
    expect(readWovenConfig({ ...creds, WOVEN_SYNC_ENABLED: "true" })).toMatchObject({ enabled: true, writesEnabled: false });
    expect(readWovenConfig({ ...creds, WOVEN_SYNC_ENABLED: "true", WOVEN_SYNC_WRITES_ENABLED: "true" })).toMatchObject({ enabled: true, writesEnabled: true });
    for (const off of ["", "false", "0", "no", "off", "maybe"]) {
      expect(readWovenConfig({ ...creds, WOVEN_SYNC_ENABLED: "true", WOVEN_SYNC_WRITES_ENABLED: off }).writesEnabled).toBe(false);
    }
    const alone = readWovenConfig({ ...creds, WOVEN_SYNC_WRITES_ENABLED: "true" });
    expect(alone.enabled).toBe(false);
    expect(alone.problems.join(" ")).toContain("WOVEN_SYNC_WRITES_ENABLED is on but WOVEN_SYNC_ENABLED is off");
  });

  it("flags the validation switch on without credentials, by name only", () => {
    const config = readWovenConfig({ WOVEN_VALIDATION_ENABLED: "true", WOVEN_USERNAME: "someone" });
    expect(config.problems.join(" ")).toContain("WOVEN_VALIDATION_ENABLED is on but WOVEN_SUBSCRIPTION_KEY, WOVEN_PASSWORD are not set");
    expect(JSON.stringify(config.problems)).not.toContain("someone");
  });

  it("flags a schedule switched on without the master switch", () => {
    const config = readWovenConfig({ WOVEN_SYNC_SCHEDULE_ENABLED: "true" });
    expect(config.problems.join(" ")).toContain("WOVEN_SYNC_ENABLED is off");
  });

  it("refuses a non-HTTPS or credential-bearing base URL", () => {
    for (const url of ["http://gateway-api.woven.team/api", "https://user:pw@evil.test/api", "https://x.test/api?k=1", "nonsense"]) {
      const config = readWovenConfig({ WOVEN_API_BASE_URL: url });
      expect(config.baseUrl).toBe("https://gateway-api.woven.team/api");
      expect(config.problems).toHaveLength(1);
    }
    expect(readWovenConfig({ WOVEN_API_BASE_URL: "https://sandbox.woven.test/api/" }).baseUrl).toBe(
      "https://sandbox.woven.test/api",
    );
  });

  it("refuses out-of-range numbers rather than clamping them", () => {
    const config = readWovenConfig({ WOVEN_PAGE_SIZE: "5000", WOVEN_MIN_COMPLETENESS_PERCENT: "10" });
    expect(config.pageSize).toBe(100);
    expect(config.minCompletenessPercent).toBe(80);
    expect(config.problems).toHaveLength(2);
  });

  it("reads login-email domains from WOVEN_LOGIN_EMAIL_DOMAINS", () => {
    const config = readWovenConfig({ WOVEN_LOGIN_EMAIL_DOMAINS: "Example.com, @glowbrands.com, bad domain" });
    expect(config.loginEmailDomains).toEqual(["example.com", "glowbrands.com"]);
    expect(config.problems).toHaveLength(1);
  });

  it("leaves nobody login-eligible when WOVEN_LOGIN_EMAIL_DOMAINS is unset", () => {
    expect(readWovenConfig({}).loginEmailDomains).toEqual([]);
  });

  it("does not read the retired WOVEN_WORK_EMAIL_DOMAINS name", () => {
    expect(readWovenConfig({ WOVEN_WORK_EMAIL_DOMAINS: "example.com" }).loginEmailDomains).toEqual([]);
  });

  it("the company is always the pinned Buff City Soap company; WOVEN_COMPANY_ID only confirms it", () => {
    for (const env of [{}, { WOVEN_COMPANY_ID: "55839F24-9241-418C-8405-37BAF9A42A87" }, { WOVEN_COMPANY_ID: "55839f24-9241-418c-8405-37baf9a42a87" }]) {
      const config = readWovenConfig({ ...env, WOVEN_PLATFORM: "2" });
      expect(config.companyId).toBe("55839f24-9241-418c-8405-37baf9a42a87");
      expect(config.tenantProblem).toBeNull();
      expect(config.platform).toBe(2);
    }
  });

  it("any other WOVEN_COMPANY_ID — another company, or not a GUID — turns the whole integration off and withholds the credentials", () => {
    const creds = { WOVEN_SUBSCRIPTION_KEY: "k", WOVEN_USERNAME: "u", WOVEN_PASSWORD: "p", WOVEN_SYNC_ENABLED: "true", WOVEN_VALIDATION_ENABLED: "true" };
    for (const companyId of ["1BA00000-0000-4000-8000-0000000000AA", "not-a-guid"]) {
      const config = readWovenConfig({ ...creds, WOVEN_COMPANY_ID: companyId });
      expect(config.companyId).toBe("55839f24-9241-418c-8405-37baf9a42a87");
      expect(config.tenantProblem).toMatch(/not the Buff City Soap company/);
      expect(config).toMatchObject({ enabled: false, validationEnabled: false, credentials: null });
      expect(JSON.stringify(config.problems)).not.toContain(companyId);
    }
  });

  it("keeps the sync OFF while WOVEN_SYNC_ENABLED is on without WOVEN_COMPANY_ID confirming the pin, and says why by name", () => {
    const creds = { WOVEN_SUBSCRIPTION_KEY: "k", WOVEN_USERNAME: "u", WOVEN_PASSWORD: "p" };
    for (const companyId of [undefined, ""]) {
      const config = readWovenConfig({
        ...creds,
        WOVEN_SYNC_ENABLED: "true",
        WOVEN_SYNC_WRITES_ENABLED: "true",
        WOVEN_SYNC_SCHEDULE_ENABLED: "true",
        ...(companyId === undefined ? {} : { WOVEN_COMPANY_ID: companyId }),
      });
      expect(config.enabled).toBe(false);
      expect(config.problems.join(" ")).toContain("WOVEN_SYNC_ENABLED is on but WOVEN_COMPANY_ID is not set, so the sync stays off");
    }
  });

  it("the read-only validation runs without WOVEN_COMPANY_ID — and still names only the pinned company", () => {
    const config = readWovenConfig({ WOVEN_SUBSCRIPTION_KEY: "k", WOVEN_USERNAME: "u", WOVEN_PASSWORD: "p", WOVEN_VALIDATION_ENABLED: "true" });
    expect(config.validationEnabled).toBe(true);
    expect(config.enabled).toBe(false);
    expect(config.problems).toEqual([]);
    expect(config.companyId).toBe("55839f24-9241-418c-8405-37baf9a42a87");
  });
});
