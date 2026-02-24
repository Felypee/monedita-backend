/**
 * Belvo Open Banking Service
 * Handles bank connections and transaction retrieval via Belvo API
 *
 * Docs: https://developers.belvo.com/
 */

import crypto from "crypto";

const BELVO_API_URL = process.env.BELVO_ENV === "production"
  ? "https://api.belvo.com"
  : "https://sandbox.belvo.com";

const BELVO_SECRET_ID = process.env.BELVO_SECRET_ID;
const BELVO_SECRET_PASSWORD = process.env.BELVO_SECRET_PASSWORD;
const BELVO_WEBHOOK_SECRET = process.env.BELVO_WEBHOOK_SECRET;
const BELVO_REDIRECT_URL = process.env.BELVO_REDIRECT_URL || "https://monedita.app/bank-connected";

/**
 * Get Basic Auth header for Belvo API
 * @returns {string} Base64 encoded credentials
 */
function getAuthHeader() {
  const credentials = `${BELVO_SECRET_ID}:${BELVO_SECRET_PASSWORD}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

/**
 * Check if Belvo is configured
 * @returns {boolean}
 */
export function isBelvoConfigured() {
  return !!(BELVO_SECRET_ID && BELVO_SECRET_PASSWORD);
}

/**
 * Create a Belvo Connect Widget access token
 * This allows users to connect their bank accounts securely
 * @param {string} phone - User's phone number (used as external_id)
 * @returns {Promise<{success: boolean, widgetToken?: string, error?: string}>}
 */
export async function createWidgetToken(phone) {
  if (!isBelvoConfigured()) {
    console.error("[belvo] Belvo credentials not configured");
    return { success: false, error: "Belvo no configurado" };
  }

  try {
    // Docs: https://developers.belvo.com/apis/belvoopenapispec/widget-access-token
    const apiUrl = process.env.BELVO_ENV === "production"
      ? "https://api.belvo.com"
      : "https://sandbox.belvo.com";

    const requestBody = {
      id: BELVO_SECRET_ID,
      password: BELVO_SECRET_PASSWORD,
      scopes: "read_institutions,write_links,read_links",
      fetch_resources: ["ACCOUNTS", "TRANSACTIONS"],
      credentials_storage: "store",
      stale_in: "365d",
    };

    console.log("[belvo] Creating widget token for:", phone);
    console.log("[belvo] Request URL:", `${apiUrl}/api/token/`);

    const response = await fetch(`${apiUrl}/api/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    console.log("[belvo] Response status:", response.status);
    console.log("[belvo] Response body:", responseText.substring(0, 200));

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("[belvo] Response is not JSON:", responseText.substring(0, 500));
      return { success: false, error: "Respuesta inválida de Belvo" };
    }

    if (!response.ok) {
      console.error("[belvo] Error creating widget token:", data);
      return { success: false, error: data.message || data.detail || JSON.stringify(data) };
    }

    console.log("[belvo] Widget token created for:", phone, "token:", data.access?.substring(0, 20) + "...");
    return {
      success: true,
      widgetToken: data.access,
      refreshToken: data.refresh,
    };
  } catch (error) {
    console.error("[belvo] Error:", error);
    return { success: false, error: "Error de conexión con Belvo" };
  }
}

/**
 * Get the Belvo Connect Widget URL
 * @param {string} phone - User's phone number
 * @param {string} widgetToken - Access token from createWidgetToken
 * @returns {string} Widget URL
 */
export function getWidgetUrl(phone, widgetToken) {
  const baseUrl = process.env.BELVO_ENV === "production"
    ? "https://connect.belvo.com"
    : "https://connect.sandbox.belvo.com";

  const params = new URLSearchParams({
    access_token: widgetToken,
    external_id: phone,
    country_codes: "CO,MX,BR", // Colombia, Mexico, Brazil
    institution_types: "retail", // Only personal banking
  });

  return `${baseUrl}/?${params.toString()}`;
}

/**
 * Get link details from Belvo
 * @param {string} linkId - Belvo link ID
 * @returns {Promise<object|null>}
 */
export async function getLink(linkId) {
  if (!isBelvoConfigured()) return null;

  try {
    const response = await fetch(`${BELVO_API_URL}/api/links/${linkId}/`, {
      headers: {
        "Authorization": getAuthHeader(),
      },
    });

    if (!response.ok) {
      console.error("[belvo] Error getting link:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("[belvo] Error getting link:", error);
    return null;
  }
}

/**
 * Delete a link from Belvo
 * @param {string} linkId - Belvo link ID
 * @returns {Promise<boolean>}
 */
export async function deleteLink(linkId) {
  if (!isBelvoConfigured()) return false;

  try {
    const response = await fetch(`${BELVO_API_URL}/api/links/${linkId}/`, {
      method: "DELETE",
      headers: {
        "Authorization": getAuthHeader(),
      },
    });

    if (!response.ok && response.status !== 404) {
      console.error("[belvo] Error deleting link:", await response.text());
      return false;
    }

    console.log("[belvo] Link deleted:", linkId);
    return true;
  } catch (error) {
    console.error("[belvo] Error deleting link:", error);
    return false;
  }
}

/**
 * Fetch accounts for a link
 * @param {string} linkId - Belvo link ID
 * @returns {Promise<Array>}
 */
export async function getAccounts(linkId) {
  if (!isBelvoConfigured()) return [];

  try {
    const response = await fetch(`${BELVO_API_URL}/api/accounts/`, {
      method: "POST",
      headers: {
        "Authorization": getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        link: linkId,
      }),
    });

    if (!response.ok) {
      console.error("[belvo] Error fetching accounts:", await response.text());
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("[belvo] Error fetching accounts:", error);
    return [];
  }
}

/**
 * Fetch transactions for a link within a date range
 * @param {string} linkId - Belvo link ID
 * @param {string} dateFrom - Start date (YYYY-MM-DD)
 * @param {string} dateTo - End date (YYYY-MM-DD)
 * @returns {Promise<Array>}
 */
export async function getTransactions(linkId, dateFrom, dateTo) {
  if (!isBelvoConfigured()) return [];

  try {
    const response = await fetch(`${BELVO_API_URL}/api/transactions/`, {
      method: "POST",
      headers: {
        "Authorization": getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        link: linkId,
        date_from: dateFrom,
        date_to: dateTo,
      }),
    });

    if (!response.ok) {
      console.error("[belvo] Error fetching transactions:", await response.text());
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("[belvo] Error fetching transactions:", error);
    return [];
  }
}

/**
 * Get list of available institutions
 * @param {string} country - Country code (CO, MX, BR)
 * @returns {Promise<Array>}
 */
export async function getInstitutions(country = "CO") {
  if (!isBelvoConfigured()) return [];

  try {
    const response = await fetch(
      `${BELVO_API_URL}/api/institutions/?country_code=${country}&type=retail`,
      {
        headers: {
          "Authorization": getAuthHeader(),
        },
      }
    );

    if (!response.ok) {
      console.error("[belvo] Error fetching institutions:", await response.text());
      return [];
    }

    const data = await response.json();
    return data.results || data;
  } catch (error) {
    console.error("[belvo] Error fetching institutions:", error);
    return [];
  }
}

/**
 * Verify webhook signature from Belvo
 * @param {string} rawBody - Raw request body
 * @param {string} signature - X-Belvo-Signature header
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signature) {
  if (!BELVO_WEBHOOK_SECRET) {
    console.warn("[belvo] BELVO_WEBHOOK_SECRET not configured, skipping verification");
    return true; // Allow in development
  }

  try {
    const expectedSignature = crypto
      .createHmac("sha256", BELVO_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    return signature === expectedSignature;
  } catch (error) {
    console.error("[belvo] Error verifying signature:", error);
    return false;
  }
}

/**
 * Parse Belvo transaction to expense format
 * @param {object} transaction - Belvo transaction
 * @param {string} phone - User's phone number
 * @returns {object|null} Expense data or null if should be ignored
 */
export function parseTransactionToExpense(transaction, phone) {
  // Skip income (positive amounts)
  if (transaction.amount >= 0) {
    return null;
  }

  // Skip pending transactions
  if (transaction.status === "PENDING") {
    return null;
  }

  // Map Belvo category to Monedita category
  const category = mapBelvoCategory(transaction.category);

  return {
    phone,
    amount: Math.abs(transaction.amount),
    category,
    description: transaction.description || transaction.merchant?.name || "",
    date: new Date(transaction.value_date || transaction.accounting_date),
    source: "bank_import",
    externalId: transaction.id,
  };
}

/**
 * Map Belvo category to Monedita category
 * @param {string} belvoCategory - Belvo category
 * @returns {string} Monedita category
 */
export function mapBelvoCategory(belvoCategory) {
  const categoryMap = {
    // Food categories
    "FOOD_AND_GROCERIES": "food",
    "RESTAURANTS_AND_BARS": "food",
    "Restaurants": "food",
    "Groceries": "food",

    // Transport categories
    "TRANSPORTATION": "transport",
    "GAS_AND_FUEL": "transport",
    "Transport": "transport",
    "Gas Stations": "transport",

    // Shopping categories
    "SHOPPING": "shopping",
    "Online Shopping": "shopping",
    "Retail": "shopping",

    // Entertainment categories
    "ENTERTAINMENT": "entertainment",
    "Entertainment": "entertainment",
    "Streaming Services": "entertainment",

    // Bills categories
    "BILLS_AND_UTILITIES": "bills",
    "Bills & Utilities": "bills",
    "Phone/Internet": "bills",
    "Insurance": "bills",

    // Health categories
    "HEALTHCARE": "health",
    "Health": "health",
    "Pharmacy": "health",

    // Default
    "OTHER": "other",
    "Unknown": "other",
    "Uncategorized": "other",
  };

  // Try exact match first
  if (categoryMap[belvoCategory]) {
    return categoryMap[belvoCategory];
  }

  // Try partial match
  const lowerCategory = (belvoCategory || "").toLowerCase();
  if (lowerCategory.includes("food") || lowerCategory.includes("grocer") || lowerCategory.includes("restaurant")) {
    return "food";
  }
  if (lowerCategory.includes("transport") || lowerCategory.includes("gas") || lowerCategory.includes("uber") || lowerCategory.includes("taxi")) {
    return "transport";
  }
  if (lowerCategory.includes("shop") || lowerCategory.includes("retail") || lowerCategory.includes("store")) {
    return "shopping";
  }
  if (lowerCategory.includes("entertain") || lowerCategory.includes("movie") || lowerCategory.includes("stream")) {
    return "entertainment";
  }
  if (lowerCategory.includes("bill") || lowerCategory.includes("utilit") || lowerCategory.includes("phone") || lowerCategory.includes("internet")) {
    return "bills";
  }
  if (lowerCategory.includes("health") || lowerCategory.includes("pharm") || lowerCategory.includes("doctor") || lowerCategory.includes("hospital")) {
    return "health";
  }

  return "other";
}

/**
 * Format date for Belvo API (YYYY-MM-DD)
 * @param {Date} date
 * @returns {string}
 */
export function formatDateForBelvo(date) {
  return date.toISOString().split("T")[0];
}

/**
 * Get default sync date range (last 30 days)
 * @returns {{dateFrom: string, dateTo: string}}
 */
export function getDefaultSyncRange() {
  const dateTo = new Date();
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - 30);

  return {
    dateFrom: formatDateForBelvo(dateFrom),
    dateTo: formatDateForBelvo(dateTo),
  };
}

export default {
  isBelvoConfigured,
  createWidgetToken,
  getWidgetUrl,
  getLink,
  deleteLink,
  getAccounts,
  getTransactions,
  getInstitutions,
  verifyWebhookSignature,
  parseTransactionToExpense,
  mapBelvoCategory,
  formatDateForBelvo,
  getDefaultSyncRange,
};
