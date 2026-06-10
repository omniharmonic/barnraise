import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

// For query use — pooled connection
const client = postgres(connectionString, { prepare: false });
export const db = drizzle(client, { schema });

export type Database = typeof db;

/** The transaction handle passed to db.transaction(async (tx) => …). */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either a pooled connection or an open transaction. */
export type DbConn = Database | Transaction;
