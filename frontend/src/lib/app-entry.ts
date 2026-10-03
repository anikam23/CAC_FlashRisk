/** Landing vs workspace. Investigation data is left untouched. */

export type AppView = "landing" | "workspace";

export function enterFlashRisk<T>(investigation: T): { view: AppView; investigation: T } {
  return { view: "workspace", investigation };
}

export function returnToLanding<T>(investigation: T): { view: AppView; investigation: T } {
  return { view: "landing", investigation };
}
