import { sql, type SQL } from "drizzle-orm";

/**
 * Reusable SQL fragments for deriving balances from point_transactions.
 * Balances are event-sourced (never stored), so these expressions are the
 * single source of truth — use them instead of re-writing the CASE sums,
 * which previously appeared verbatim in half a dozen queries and could drift.
 *
 * Each fragment must be evaluated in a query whose FROM includes
 * point_transactions (aliased or not); they reference the unqualified
 * tx_type / hours columns so they compose with both standalone aggregates
 * and joined/grouped aggregates.
 */
export const earnedHoursExpr: SQL<number> = sql<number>`coalesce(sum(case when tx_type in ('earn', 'starting_balance') then hours::numeric else 0 end), 0)::numeric`;

export const spentHoursExpr: SQL<number> = sql<number>`coalesce(sum(case when tx_type = 'spend' then hours::numeric else 0 end), 0)::numeric`;

export const balanceHoursExpr: SQL<number> = sql<number>`(
  coalesce(sum(case when tx_type in ('earn', 'starting_balance') then hours::numeric else 0 end), 0) -
  coalesce(sum(case when tx_type = 'spend' then hours::numeric else 0 end), 0)
)::numeric`;
