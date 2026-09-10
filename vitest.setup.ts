import { config } from "dotenv";

// Tests must never touch the development database. `.env.test` points
// DATABASE_URL at the isolated `habit_tracker_test` database; `override: true`
// makes sure it wins over anything already present in the environment.
config({ path: ".env.test", override: true });

if (!process.env.DATABASE_URL?.includes("habit_tracker_test")) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not point at the test database (got: ${process.env.DATABASE_URL ?? "undefined"}). Create .env.test from .env.test.example.`
  );
}
