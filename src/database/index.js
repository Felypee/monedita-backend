// DB selector: exports the same names used across the app
// Use DB_DRIVER env var to choose between 'inmemory' (default) and 'supabase'
import * as InMemory from "./inMemoryDB.js";
import * as SubscriptionInMemory from "./subscriptionDB.inMemory.js";
import * as PaymentSourceInMemory from "./paymentSourceDB.inMemory.js";
import * as BankLinkInMemory from "./bankLinkDB.inMemory.js";
import * as SharedExpensesInMemory from "./sharedExpensesDB.inMemory.js";

const driver = (process.env.DB_DRIVER || "inmemory").toLowerCase();

let UserDB = InMemory.UserDB;
let ExpenseDB = InMemory.ExpenseDB;
let BudgetDB = InMemory.BudgetDB;
let UnprocessedDB = InMemory.UnprocessedDB;
let SubscriptionPlanDB = SubscriptionInMemory.SubscriptionPlanDB;
let UserSubscriptionDB = SubscriptionInMemory.UserSubscriptionDB;
let UsageDB = SubscriptionInMemory.UsageDB;
let MoneditasDB = SubscriptionInMemory.MoneditasDB;
let PaymentSourceDB = PaymentSourceInMemory.PaymentSourceDB;
let BillingHistoryDB = PaymentSourceInMemory.BillingHistoryDB;
let BankLinkDB = BankLinkInMemory.BankLinkDB;
let BankImportUsageDB = BankLinkInMemory.BankImportUsageDB;
let ExpenseGroupDB = SharedExpensesInMemory.ExpenseGroupDB;
let GroupMemberDB = SharedExpensesInMemory.GroupMemberDB;
let SharedExpenseDB = SharedExpensesInMemory.SharedExpenseDB;
let ExpenseSplitDB = SharedExpensesInMemory.ExpenseSplitDB;
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
    MoneditasDB = SubscriptionSupabase.MoneditasDB;

    // Load payment source DBs from Supabase
    const PaymentSourceSupabase = await import("./paymentSourceDB.supabase.js");
    PaymentSourceDB = PaymentSourceSupabase.PaymentSourceDB;
    BillingHistoryDB = PaymentSourceSupabase.BillingHistoryDB;

    // Load bank link DBs from Supabase
    const BankLinkSupabase = await import("./bankLinkDB.supabase.js");
    BankLinkDB = BankLinkSupabase.BankLinkDB;
    BankImportUsageDB = BankLinkSupabase.BankImportUsageDB;

    // Load shared expenses DBs from Supabase
    const SharedExpensesSupabase = await import("./sharedExpensesDB.supabase.js");
    ExpenseGroupDB = SharedExpensesSupabase.ExpenseGroupDB;
    GroupMemberDB = SharedExpensesSupabase.GroupMemberDB;
    SharedExpenseDB = SharedExpensesSupabase.SharedExpenseDB;
    ExpenseSplitDB = SharedExpensesSupabase.ExpenseSplitDB;
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
  MoneditasDB,
  PaymentSourceDB,
  BillingHistoryDB,
  BankLinkDB,
  BankImportUsageDB,
  ExpenseGroupDB,
  GroupMemberDB,
  SharedExpenseDB,
  ExpenseSplitDB,
  testConnection,
  supabase,
};
