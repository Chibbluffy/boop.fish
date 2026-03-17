import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 10,           // connection pool size
  idle_timeout: 30,  // seconds before idle connection is closed
  connect_timeout: 10,
});

export default sql;
