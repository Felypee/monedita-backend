// DB selector: exports the same names used across the app
// Use DB_DRIVER env var to choose between 'inmemory' (default) and 'supabase'
import * as InMemory from "./inMemoryDB.js";
import * as SubscriptionInMemory from "./subscriptionDB.inMemory.js";

const driver = (process.env.DB_DRIVER || "inmemory").toLowerCase();

let UserDB = InMemory.UserDB;
let ExpenseDB = InMemory.ExpenseDB;
let BudgetDB = InMemory.BudgetDB;
let UnprocessedDB = InMemory.UnprocessedDB;
let SubscriptionPlanDB = SubscriptionInMemory.SubscriptionPlanDB;
let UserSubscriptionDB = SubscriptionInMemory.UserSubscriptionDB;
let UsageDB = SubscriptionInMemory.UsageDB;
let testConnection = () => Promise.resolve(true);
let supabase = null;

// Dynamically import supabase implementation only when requested.
// The supabase module throws on missing env vars, so avoid static import.
if (driver === "supabase" || driver === "supa") {
  try {
    // Try the expected filename first, but some filesystems/case issues can make the
    // actual file name different (supaBaseDB.js). Try both to be robust in deploy.
    let Supabase;
    Supabase = await import("./supabaseDB.js");
    UserDB = Supabase.UserDB;
    ExpenseDB = Supabase.ExpenseDB;
    BudgetDB = Supabase.BudgetDB;
    UnprocessedDB = Supabase.UnprocessedDB;
    testConnection = Supabase.testConnection;
    supabase = Supabase.supabase;

    // Load subscription DBs from Supabase
    const SubscriptionSupabase = await import("./subscriptionDB.supabase.js");
    SubscriptionPlanDB = SubscriptionSupabase.SubscriptionPlanDB;
    UserSubscriptionDB = SubscriptionSupabase.UserSubscriptionDB;
    UsageDB = SubscriptionSupabase.UsageDB;
  } catch (err) {
    // If dynamic import fails, keep using in-memory and warn
    console.warn(
      "Could not load Supabase DB module, falling back to in-memory DB:",
      err.message || err,
    );
  }
}

console.log("[database] DB_DRIVER=", driver);

export {
  UserDB,
  ExpenseDB,
  BudgetDB,
  UnprocessedDB,
  SubscriptionPlanDB,
  UserSubscriptionDB,
  UsageDB,
  testConnection,
  supabase,
};
