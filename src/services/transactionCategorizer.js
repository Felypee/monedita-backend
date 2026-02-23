/**
 * Transaction Categorizer
 * Enhanced categorization for bank-imported transactions using merchant patterns
 */

// Merchant name patterns to categories
const MERCHANT_PATTERNS = {
  food: [
    // Supermarkets
    /\b(exito|carulla|jumbo|d1|ara|olimpica|metro|surtimax|colsubsidio|alkosto|makro)\b/i,
    /\b(walmart|costco|target|whole\s*foods|trader\s*joe|kroger|safeway|publix)\b/i,
    /\b(carrefour|lidl|aldi|mercadona|dia)\b/i,
    // Restaurants
    /\b(mc\s*donald|burger\s*king|kfc|subway|domino|pizza\s*hut|starbucks|dunkin)\b/i,
    /\b(rappi|uber\s*eats|domicilios|pedidos\s*ya|ifood|didi\s*food)\b/i,
    /\b(restaurante?|cafeteria|cafe|panaderia|bakery|restaurant)\b/i,
  ],
  transport: [
    /\b(uber|lyft|didi|cabify|beat|indriver)\b/i,
    /\b(avianca|latam|viva\s*air|wingo|copa|american|delta|united)\b/i,
    /\b(transmilenio|metro|sitp|mio|megabus)\b/i,
    /\b(exxon|mobil|shell|texaco|terpel|primax|biomax|puma)\b/i,
    /\b(parqueadero|parking|estacionamiento|toll|peaje)\b/i,
  ],
  shopping: [
    /\b(amazon|mercado\s*libre|linio|falabella|ripley|paris)\b/i,
    /\b(zara|h&m|forever\s*21|uniqlo|nike|adidas|puma)\b/i,
    /\b(homecenter|home\s*depot|lowes|easy|sodimac)\b/i,
    /\b(aliexpress|shein|temu|wish)\b/i,
    /\b(apple\s*store|samsung|huawei|xiaomi)\b/i,
  ],
  entertainment: [
    /\b(netflix|spotify|disney|hbo|amazon\s*prime|youtube|apple\s*music)\b/i,
    /\b(playstation|xbox|steam|nintendo|epic\s*games)\b/i,
    /\b(cinecolombia|cine\s*mark|amc|cinepolis|multiplex)\b/i,
    /\b(teatro|theater|concert|concierto|evento|event)\b/i,
  ],
  bills: [
    /\b(epm|codensa|vanti|gas\s*natural|electricaribe)\b/i,
    /\b(claro|movistar|tigo|wom|etb|virgin)\b/i,
    /\b(acueducto|agua|water|electric|luz|gas)\b/i,
    /\b(netflix|spotify|suscripcion|subscription|mensualidad)\b/i,
    /\b(seguro|insurance|sura|liberty|mapfre|allianz)\b/i,
  ],
  health: [
    /\b(drogueria|farmacia|pharmacy|cvs|walgreens|cruz\s*verde|la\s*rebaja)\b/i,
    /\b(clinica|hospital|clinic|medical|medico|doctor)\b/i,
    /\b(eps|colsanitas|sura\s*eps|coomeva|salud\s*total)\b/i,
    /\b(odontolog|dental|dentist|optometria|optica|vision)\b/i,
    /\b(gimnasio|gym|fitness|bodytech|smart\s*fit)\b/i,
  ],
};

// MCC (Merchant Category Code) to category mapping
const MCC_MAPPING = {
  // Food & Groceries (5411-5499)
  "5411": "food", // Grocery stores
  "5412": "food", // Convenience stores
  "5441": "food", // Candy, nut stores
  "5451": "food", // Dairy products
  "5462": "food", // Bakeries
  "5499": "food", // Misc food stores

  // Restaurants (5812-5814)
  "5812": "food", // Restaurants
  "5813": "food", // Bars/drinking places
  "5814": "food", // Fast food

  // Transport (4000-4799, 5541-5542)
  "4111": "transport", // Local passenger transport
  "4112": "transport", // Railroads
  "4121": "transport", // Taxicabs/limousines
  "4131": "transport", // Bus lines
  "4511": "transport", // Airlines
  "5541": "transport", // Service stations
  "5542": "transport", // Fuel dealers

  // Shopping (5200-5399, 5600-5699)
  "5200": "shopping", // Home supply stores
  "5211": "shopping", // Building materials
  "5251": "shopping", // Hardware stores
  "5311": "shopping", // Department stores
  "5331": "shopping", // Variety stores
  "5399": "shopping", // Misc general merchandise
  "5611": "shopping", // Men's clothing
  "5621": "shopping", // Women's clothing
  "5641": "shopping", // Children's wear
  "5651": "shopping", // Family clothing
  "5661": "shopping", // Shoe stores
  "5691": "shopping", // Men's/women's clothing
  "5699": "shopping", // Misc apparel

  // Entertainment (7800-7999)
  "7829": "entertainment", // Motion picture
  "7832": "entertainment", // Motion picture theaters
  "7841": "entertainment", // Video tape rental
  "7911": "entertainment", // Dance halls/studios
  "7922": "entertainment", // Theatrical producers
  "7929": "entertainment", // Bands/orchestras
  "7932": "entertainment", // Billiard/pool
  "7933": "entertainment", // Bowling alleys
  "7941": "entertainment", // Sports arenas
  "7991": "entertainment", // Tourist attractions
  "7992": "entertainment", // Golf courses
  "7993": "entertainment", // Video amusement
  "7994": "entertainment", // Video game arcades
  "7996": "entertainment", // Amusement parks
  "7997": "entertainment", // Recreation services
  "7998": "entertainment", // Aquariums
  "7999": "entertainment", // Recreation services

  // Bills/Utilities (4800-4899)
  "4814": "bills", // Telephone services
  "4816": "bills", // Computer network services
  "4821": "bills", // Telegraph services
  "4829": "bills", // Money transfer
  "4899": "bills", // Cable/satellite/other TV
  "4900": "bills", // Utilities

  // Health (4119, 5912, 8000-8099)
  "4119": "health", // Ambulance services
  "5912": "health", // Drug stores/pharmacies
  "8011": "health", // Doctors
  "8021": "health", // Dentists/orthodontists
  "8031": "health", // Osteopaths
  "8041": "health", // Chiropractors
  "8042": "health", // Optometrists
  "8043": "health", // Opticians
  "8049": "health", // Podiatrists
  "8050": "health", // Nursing care facilities
  "8062": "health", // Hospitals
  "8071": "health", // Medical/dental labs
  "8099": "health", // Medical services
};

/**
 * Categorize a transaction based on merchant info and MCC
 * @param {object} transaction - Belvo transaction
 * @returns {string} Category name
 */
export function categorizeTransaction(transaction) {
  const merchantName = (
    transaction.merchant?.name ||
    transaction.description ||
    ""
  ).toLowerCase();

  const mcc = transaction.mcc || transaction.merchant?.mcc;

  // First try MCC if available
  if (mcc && MCC_MAPPING[mcc]) {
    return MCC_MAPPING[mcc];
  }

  // Then try merchant name patterns
  for (const [category, patterns] of Object.entries(MERCHANT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(merchantName)) {
        return category;
      }
    }
  }

  // Try Belvo's category if provided
  if (transaction.category) {
    const belvoCategory = mapBelvoCategory(transaction.category);
    if (belvoCategory !== "other") {
      return belvoCategory;
    }
  }

  return "other";
}

/**
 * Map Belvo's category to Monedita category
 * (Duplicate from belvoService for standalone usage)
 * @param {string} belvoCategory
 * @returns {string}
 */
function mapBelvoCategory(belvoCategory) {
  const categoryMap = {
    "FOOD_AND_GROCERIES": "food",
    "RESTAURANTS_AND_BARS": "food",
    "TRANSPORTATION": "transport",
    "GAS_AND_FUEL": "transport",
    "SHOPPING": "shopping",
    "ENTERTAINMENT": "entertainment",
    "BILLS_AND_UTILITIES": "bills",
    "HEALTHCARE": "health",
    "Restaurants": "food",
    "Groceries": "food",
    "Transport": "transport",
    "Gas Stations": "transport",
    "Online Shopping": "shopping",
    "Retail": "shopping",
    "Entertainment": "entertainment",
    "Streaming Services": "entertainment",
    "Bills & Utilities": "bills",
    "Phone/Internet": "bills",
    "Insurance": "bills",
    "Health": "health",
    "Pharmacy": "health",
  };

  return categoryMap[belvoCategory] || "other";
}

/**
 * Batch categorize transactions
 * @param {Array} transactions - Array of Belvo transactions
 * @returns {Map<string, string>} Map of transaction ID to category
 */
export function batchCategorize(transactions) {
  const results = new Map();

  for (const transaction of transactions) {
    results.set(transaction.id, categorizeTransaction(transaction));
  }

  return results;
}

/**
 * Get category statistics from transactions
 * @param {Array} transactions - Categorized transactions
 * @returns {object} Category statistics
 */
export function getCategoryStats(transactions) {
  const stats = {};

  for (const transaction of transactions) {
    const category = transaction.category || categorizeTransaction(transaction);
    const amount = Math.abs(transaction.amount);

    if (!stats[category]) {
      stats[category] = { count: 0, total: 0 };
    }

    stats[category].count++;
    stats[category].total += amount;
  }

  // Sort by total spending
  const sorted = Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .reduce((obj, [key, value]) => {
      obj[key] = value;
      return obj;
    }, {});

  return sorted;
}

export default {
  categorizeTransaction,
  batchCategorize,
  getCategoryStats,
  MERCHANT_PATTERNS,
  MCC_MAPPING,
};
