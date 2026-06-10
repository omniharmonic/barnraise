/**
 * Shared semantic color helpers so balance / reliability coloring is
 * consistent across the dashboard, pool, profile, and member pages instead
 * of being re-derived inline in each.
 */

/** Tailwind text color for a balance value (sage when >= 0, barn when negative). */
export function balanceColor(balance: number): string {
  return balance >= 0 ? "text-sage" : "text-barn";
}

/** Tailwind text color for an attendance-reliability percentage (0–100). */
export function reliabilityColor(pct: number): string {
  if (pct >= 80) return "text-sage";
  if (pct >= 50) return "text-golden-dark";
  return "text-barn";
}
