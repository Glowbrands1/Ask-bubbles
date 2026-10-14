import { describe, expect, it, vi } from "vitest";

import {
  RECOVERY_FORWARD_PATH,
  RECOVERY_FORWARD_SCRIPT,
  recoveryForwardTarget,
} from "@/lib/auth/recovery-forward";
import { SET_PASSWORD_PATH } from "@/lib/auth/routes";

const RECOVERY =
  "#access_token=AT.secret&expires_in=3600&refresh_token=RT&token_type=bearer&type=recovery";
const EXPIRED =
  "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

describe("recoveryForwardTarget", () => {
  it("forwards the exact link production produced: the site root with a recovery fragment", () => {
    expect(recoveryForwardTarget("/", RECOVERY)).toBe(`/reset-password${RECOVERY}`);
  });

  it("forwards a recovery fragment from any page, including the sign-in screen it used to fall into", () => {
    for (const path of ["/", "/login", "/forgot-password", "/chat"]) {
      expect(recoveryForwardTarget(path, RECOVERY)).toBe(`/reset-password${RECOVERY}`);
    }
  });

  it("leaves /reset-password alone (it consumes the fragment itself)", () => {
    expect(recoveryForwardTarget("/reset-password", RECOVERY)).toBeNull();
  });

  it("does not touch invitation links or other token types", () => {
    expect(recoveryForwardTarget("/", RECOVERY.replace("recovery", "invite"))).toBeNull();
    expect(recoveryForwardTarget("/", RECOVERY.replace("&type=recovery", ""))).toBeNull();
    expect(recoveryForwardTarget("/auth/accept", RECOVERY.replace("recovery", "invite"))).toBeNull();
  });

  it("needs both tokens: a half-link is not forwarded as if it could work", () => {
    expect(recoveryForwardTarget("/", "#access_token=a&type=recovery")).toBeNull();
  });

  it("sends an expired/used/scanned link's refusal to the friendly screen, from / and /login only", () => {
    expect(recoveryForwardTarget("/", EXPIRED)).toBe(`/reset-password${EXPIRED}`);
    expect(recoveryForwardTarget("/login", EXPIRED)).toBe(`/reset-password${EXPIRED}`);
    expect(recoveryForwardTarget("/auth/accept", EXPIRED)).toBeNull();
    expect(recoveryForwardTarget("/chat", EXPIRED)).toBeNull();
  });

  it("ignores ordinary pages and unrelated fragments", () => {
    expect(recoveryForwardTarget("/", "")).toBeNull();
    expect(recoveryForwardTarget("/", "#")).toBeNull();
    expect(recoveryForwardTarget("/chat", "#section-2")).toBeNull();
  });

  it("targets the real password screen", () => {
    expect(RECOVERY_FORWARD_PATH).toBe(SET_PASSWORD_PATH);
    expect(recoveryForwardTarget("/", RECOVERY)?.startsWith(`${SET_PASSWORD_PATH}#`)).toBe(true);
  });
});

describe("RECOVERY_FORWARD_SCRIPT (what actually runs in the browser)", () => {
  function run(pathname: string, hash: string) {
    const replace = vi.fn();
    new Function("location", RECOVERY_FORWARD_SCRIPT)({ pathname, hash, replace });
    return replace;
  }

  it("is self-contained and replaces the history entry with the reset screen", () => {
    const replace = run("/", RECOVERY);
    expect(replace).toHaveBeenCalledExactlyOnceWith(`/reset-password${RECOVERY}`);
  });

  it("does nothing on a normal page load", () => {
    expect(run("/", "")).not.toHaveBeenCalled();
    expect(run("/login", "")).not.toHaveBeenCalled();
  });

  it("never throws into the page, even on a malformed location", () => {
    expect(() => new Function("location", RECOVERY_FORWARD_SCRIPT)(undefined)).not.toThrow();
  });

  it("does not log or transmit anything", () => {
    expect(RECOVERY_FORWARD_SCRIPT).not.toMatch(/console|fetch|XMLHttpRequest|sendBeacon|document\.cookie|localStorage/);
  });
});
