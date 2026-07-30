import { describe, expect, it } from "vitest";
import { canonicalView, viewFromPath, workspaceMeta, workspacePath, workspaceViews } from "../apps/web/lib/workspace-routes";

describe("workspace routing", () => {
  it("resolves every top-level workspace path to the screen it belongs to", () => {
    // `openalex` and `zotero` now share `/library` (§16.7), so a path resolves
    // to a view that opens the same screen rather than to the same view id.
    // `project` has no top-level path at all — it is only ever reached at
    // `/g/:goalId/p/:projectId`, which the deep-link case below pins.
    for (const view of workspaceViews.filter((entry) => entry !== "project")) {
      expect(canonicalView(viewFromPath(workspacePath[view] as string))).toBe(canonicalView(view));
    }
  });

  it("uses the §7.1 addresses, not the pre-rename ones", () => {
    expect(workspacePath.today).toBe("/home");
    expect(workspacePath.assistant).toBe("/ask");
    expect(workspacePath.goals).toBe("/plan");
    expect(workspacePath.code).toBe("/build");
    expect(workspacePath.memory).toBe("/context");
    expect(workspacePath.activity).toBe("/review");
    expect(workspacePath.account).toBe("/settings");
    expect(workspacePath.integrations).toBe("/settings/connections");
  });

  it("separates Connections from the rest of Settings by its second segment", () => {
    expect(viewFromPath("/settings/connections")).toBe("integrations");
    expect(viewFromPath("/settings/ai")).toBe("account");
    expect(viewFromPath("/settings")).toBe("account");
  });

  it("resolves deep links by prefix instead of dropping the user on Today", () => {
    // The regression: `/openalex/works/W2741809807` was not a key in the exact-match
    // map, so pressing Back from a deep link showed Today under the deep-link URL.
    expect(viewFromPath("/library/works/W2741809807")).toBe("library");
    expect(viewFromPath("/research/project_123/claims")).toBe("research");
    expect(viewFromPath("/learn/concept_potential")).toBe("learn");
    expect(viewFromPath("/ask/session_9")).toBe("assistant");
    // A project is its own screen, so it must not resolve to its goal.
    expect(viewFromPath("/g/goal_1/p/project_1")).toBe("project");
    expect(viewFromPath("/g/goal_1")).toBe("goal");
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
