/**
 * Tool: Set Currency
 * Sets user's currency preference
 */

import { UserDB } from "../database/index.js";
import { isValidCurrency, getCurrencyName } from "../utils/currencyUtils.js";
import { getMessage } from "../utils/languageUtils.js";

export const definition = {
  name: "set_currency",
  description: "Set the user's currency for expense tracking. Use when user specifies their currency. Examples: 'my currency is USD', 'use COP', 'set currency to EUR'",
  input_schema: {
    type: "object",
    properties: {
      currencyCode: {
        type: "string",
        description: "3-letter currency code (e.g., USD, EUR, COP, BRL)"
      }
    },
    required: ["currencyCode"]
  }
};

export async function handler(phone, params, lang, userCurrency) {
  const { currencyCode } = params;
  const code = currencyCode.toUpperCase();

  // Check if currency is already set
  const existingCurrency = await UserDB.getCurrency(phone);
  if (existingCurrency) {
    return {
      success: false,
      message: getMessage('currency_already_set', lang, {
        currency: `${getCurrencyName(existingCurrency)} (${existingCurrency})`
      })
    };
  }

  // Validate currency code
  if (!isValidCurrency(code)) {
    return {
      success: false,
      message: getMessage('currency_invalid', lang, { code })
    };
  }

  // Set the currency
  await UserDB.setCurrency(phone, code);

  return {
    success: true,
    message: getMessage('currency_set', lang, {
      currency: `${getCurrencyName(code)} (${code})`
    })
  };
}

export default { definition, handler };
