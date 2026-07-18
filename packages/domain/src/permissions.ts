export const scopes = [
  "memory:read", "memory:write", "goals:read", "goals:write", "learning:read", "learning:write",
  "research:read", "research:write", "schedule:read", "schedule:propose", "schedule:commit",
  "resources:read", "routing:invoke",
] as const;

export type Scope = (typeof scopes)[number];

export function requireScope(granted: readonly string[], required: Scope) {
  if (!granted.includes(required)) throw new Error(`Missing required scope: ${required}`);
  return true;
}

export function canAccessProject(projectId: string, allowedProjectIds: readonly string[]) {
  return allowedProjectIds.includes(projectId);
}
