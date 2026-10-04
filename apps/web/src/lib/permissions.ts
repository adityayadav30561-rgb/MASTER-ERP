/**
 * Menu and button visibility from the permissions /api/v1/me returns. The same pattern rule as the server
 * (kernel authz permissionMatches); the server still checks every request.
 */
export function permissionMatches(pattern: string, permission: string): boolean {
  if (pattern === "*" || pattern === permission) return true;
  if (pattern.endsWith(".*")) return permission.startsWith(pattern.slice(0, -1));
  return false;
}

export function can(granted: readonly string[] | undefined, permission: string): boolean {
  return (granted ?? []).some((p) => permissionMatches(p, permission));
}
