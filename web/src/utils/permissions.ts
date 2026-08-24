// Permission and device-policy helpers.
// These read session metadata stored at login. The backend is authoritative;
// frontend helpers only control UI visibility — never trust them for security.

const PERMISSIONS_KEY = "gowms_permissions";
const DEVICE_POLICY_KEY = "gowms_device_policy";
const WAREHOUSE_IDS_KEY = "gowms_warehouse_ids";

// SSR-safe localStorage wrapper.
function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function safeRemoveItem(key: string) {
  try { localStorage.removeItem(key); } catch {}
}

export interface DevicePolicy {
  desktop: boolean;
  handheld: boolean;
  camera: boolean;
}

/** Store permissions from the login response (additive to existing session). */
export function storePermissions(permissions: string[] | undefined) {
  if (permissions && permissions.length > 0) {
    safeSetItem(PERMISSIONS_KEY, JSON.stringify(permissions));
  } else {
    safeRemoveItem(PERMISSIONS_KEY);
  }
}

/** Store device policy from the login response. */
export function storeDevicePolicy(policy: DevicePolicy | undefined) {
  if (policy) {
    safeSetItem(DEVICE_POLICY_KEY, JSON.stringify(policy));
  } else {
    safeRemoveItem(DEVICE_POLICY_KEY);
  }
}

/** Store warehouse IDs from the login response. */
export function storeWarehouseIds(ids: number[] | undefined) {
  if (ids && ids.length > 0) {
    safeSetItem(WAREHOUSE_IDS_KEY, JSON.stringify(ids));
  } else {
    safeRemoveItem(WAREHOUSE_IDS_KEY);
  }
}

/** Load stored permissions. */
export function getPermissions(): string[] {
  try {
    const raw = safeGetItem(PERMISSIONS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/** Load stored device policy. */
export function getDevicePolicy(): DevicePolicy | null {
  try {
    const raw = safeGetItem(DEVICE_POLICY_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/** Load stored warehouse IDs. */
export function getWarehouseIds(): number[] {
  try {
    const raw = safeGetItem(WAREHOUSE_IDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Check whether the current user has a named permission.
 * Falls back to the existing role-based model when no permission list is stored
 * (compatibility mode before enforcement rollout).
 */
export function hasPermission(permission: string): boolean {
  const perms = getPermissions();
  if (perms.length === 0) {
    // Compatibility fallback: admin always passes, otherwise consult roleAccess.
    const role = (safeGetItem("gowms_role") || "").toLowerCase();
    if (role === "admin") return true;
    // For now during migration, allow all authenticated users.
    // When RBAC enforcement is enabled, remove this line.
    return true;
  }
  if (perms.includes("*")) return true;
  return perms.includes(permission);
}

/**
 * Check device access for the current user's role.
 */
export function canUseDevice(device: "desktop" | "handheld" | "camera"): boolean {
  const policy = getDevicePolicy();
  if (!policy) {
    // Compatibility fallback: allow all devices.
    return true;
  }
  return policy[device] === true;
}

/**
 * Check if the user may access a specific warehouse.
 */
export function canAccessWarehouse(warehouseId: number): boolean {
  const ids = getWarehouseIds();
  if (ids.length === 0) return true; // not scoped
  return ids.includes(warehouseId);
}

/** Clear all permission/policy data (called on logout). */
export function clearPermissions() {
  safeRemoveItem(PERMISSIONS_KEY);
  safeRemoveItem(DEVICE_POLICY_KEY);
  safeRemoveItem(WAREHOUSE_IDS_KEY);
}