import { describe, expect, it } from "vitest";
import { isPublicSafeMessage, publicErrorMessage } from "../apps/web/lib/api-errors";

describe("public error messages", () => {
  it("keeps deliberate user-facing copy", () => {
    expect(isPublicSafeMessage("Enter at least two search characters.")).toBe(true);
    expect(publicErrorMessage(new Error("This block conflicts with a protected commitment."), "fallback"))
      .toBe("This block conflicts with a protected commitment.");
  });

  it("blocks the raw Drizzle dump that leaked onto the OpenAlex screen", () => {
    const leak = 'Failed query: select library_type, library_id, item_key, title, doi, source_id from zotero_items where user_id = $1 and deleted = false and lower(doi) = any(($2, $3, $4)) params: user_demo,10.1107/s0108767307043930';
    expect(isPublicSafeMessage(leak)).toBe(false);
    expect(publicErrorMessage(new Error(leak), "Something went wrong.")).toBe("Something went wrong.");
  });

  it("blocks bundle URLs, stack frames, driver names, and credentials", () => {
    expect(isPublicSafeMessage('near "while": syntax error at a.handleError (https://continuumstudy.vercel.app/_next/static/chunks/6796.js)')).toBe(false);
    expect(isPublicSafeMessage("boom\n    at Object.run (/var/task/index.js:1:1)")).toBe(false);
    expect(isPublicSafeMessage("connect ECONNREFUSED 10.0.0.1:5432")).toBe(false);
    expect(isPublicSafeMessage('relation "zotero_items" does not exist')).toBe(false);
    expect(isPublicSafeMessage("request failed for api_key=sk-live-123456")).toBe(false);
    expect(isPublicSafeMessage("owned by user_demo1234 already")).toBe(false);
  });

  it("blocks dumps that are simply too long to be copy", () => {
    expect(isPublicSafeMessage("x".repeat(400))).toBe(false);
    expect(publicErrorMessage("not an error", "fallback")).toBe("fallback");
  });
});
