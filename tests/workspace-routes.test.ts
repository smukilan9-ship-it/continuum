import { describe, expect, it } from "vitest";
import { canonicalView, viewFromPath, workspaceMeta, workspacePath, workspaceViews } from "../apps/web/lib/workspace-routes";

describe("workspace routing", () => {
  it("resolves every top-level workspace path to its own view", () => {
    for (const view of workspaceViews) expect(viewFromPath(workspacePath[view] as string)).toBe(view);
  });

  it("resolves deep links by prefix instead of dropping the user on Today", () => {
    // The regression: `/openalex/works/W2741809807` was not a key in the exact-match
    // map, so pressing Back from a deep link showed Today under the deep-link URL.
    expect(viewFromPath("/library/works/W2741809807")).toBe("library");
    expect(viewFromPath("/openalex/topics/T10715")).toBe("openalex");
    expect(viewFromPath("/research/project_123/claims")).toBe("research");
    expect(viewFromPath("/learn/concept_potential")).toBe("learn");
    expect(viewFromPath("/assistant/session_9")).toBe("assistant");
  });

  it("resolves a goal deep link to the goal view", () => {
    // The sidebar lists the user's goals, so `/g/:id` has to survive a refresh
    // and a Back press rather than falling back to Today.
    expect(viewFromPath("/g/goal_demo_sat")).toBe("goal");
    expect(viewFromPath("/g/goal_demo_oasis")).toBe("goal");
    expect(canonicalView("goal")).toBe("goal");
  });

  it("keeps trailing slashes and unknown paths on the safe default", () => {
    expect(viewFromPath("/")).toBe("today");
    expect(viewFromPath("/nothing-here")).toBe("today");
    expect(viewFromPath("/library/")).toBe("library");
  });

  it("folds the pre-merge scholarly views onto the Library destination", () => {
    expect(canonicalView("openalex")).toBe("library");
    expect(canonicalView("zotero")).toBe("library");
    expect(canonicalView("memory")).toBe("memory");
  });

  it("gives every view a path and a title", () => {
    for (const view of workspaceViews) {
      expect(workspacePath[view]).toMatch(/^\//);
      expect(workspaceMeta[view].title.length).toBeGreaterThan(0);
      expect(workspaceMeta[view].description.length).toBeGreaterThan(0);
    }
  });
});
