import { describe, expect, it } from "vitest";
import { securePostgresConnectionString } from "../packages/db/src/connection";

describe("securePostgresConnectionString", () => {
  it.each(["prefer", "require", "verify-ca"])("upgrades sslmode=%s to verify-full", (mode) => {
    const secured = new URL(securePostgresConnectionString(`postgresql://user:pass@db.example.com/app?sslmode=${mode}`));
    expect(secured.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("preserves an explicit verify-full mode", () => {
    const secured = new URL(securePostgresConnectionString("postgresql://user:pass@db.example.com/app?sslmode=verify-full&application_name=continuum"));
    expect(secured.searchParams.get("sslmode")).toBe("verify-full");
    expect(secured.searchParams.get("application_name")).toBe("continuum");
  });

  it.each(["disable", "", "allow"])('forces remote sslmode="%s" to verify-full', (mode) => {
    const query = mode ? `?sslmode=${mode}` : "";
    const secured = new URL(securePostgresConnectionString(`postgresql://user:pass@db.example.com/app${query}`));
    expect(secured.searchParams.get("sslmode")).toBe("verify-full");
  });

  it("allows a loopback development database without forcing TLS", () => {
    const secured = new URL(securePostgresConnectionString("postgresql://user:pass@127.0.0.1:5432/app"));
    expect(secured.searchParams.has("sslmode")).toBe(false);
  });
});
