/**
 * In-memory Bank Link Database
 * Stores Belvo bank connections for Open Banking integration
 */

// Store bank links
const bankLinks = new Map();
// Store import usage per period
const bankImportUsage = new Map();

let bankLinkIdCounter = 1;

/**
 * Bank Link operations
 */
export const BankLinkDB = {
  /**
   * Create a new bank link
   * @param {string} phone - User's phone number
   * @param {object} data - Link data
   * @returns {object} Created bank link
   */
  create(phone, data) {
    const link = {
      id: bankLinkIdCounter++,
      phone,
      linkId: data.linkId,
      institution: data.institution,
      institutionId: data.institutionId,
      status: data.status || 'pending',
      lastSyncAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const userLinks = bankLinks.get(phone) || [];
    userLinks.push(link);
    bankLinks.set(phone, userLinks);

    return link;
  },

  /**
   * Get all bank links for a user
   * @param {string} phone - User's phone number
   * @returns {Array} User's bank links
   */
  getByUser(phone) {
    return bankLinks.get(phone) || [];
  },

  /**
   * Get a bank link by Belvo link ID
   * @param {string} linkId - Belvo link ID
   * @returns {object|null} Bank link or null
   */
  getByLinkId(linkId) {
    for (const userLinks of bankLinks.values()) {
      const link = userLinks.find(l => l.linkId === linkId);
      if (link) return link;
    }
    return null;
  },

  /**
   * Get active bank links for a user
   * @param {string} phone - User's phone number
   * @returns {Array} Active bank links
   */
  getActiveByUser(phone) {
    const userLinks = bankLinks.get(phone) || [];
    return userLinks.filter(l => l.status === 'active');
  },

  /**
   * Update a bank link
   * @param {string} linkId - Belvo link ID
   * @param {object} updates - Fields to update
   * @returns {object|null} Updated link or null
   */
  update(linkId, updates) {
    for (const [phone, userLinks] of bankLinks.entries()) {
      const linkIndex = userLinks.findIndex(l => l.linkId === linkId);
      if (linkIndex !== -1) {
        userLinks[linkIndex] = {
          ...userLinks[linkIndex],
          ...updates,
          updatedAt: new Date(),
        };
        bankLinks.set(phone, userLinks);
        return userLinks[linkIndex];
      }
    }
    return null;
  },

  /**
   * Update link status
   * @param {string} linkId - Belvo link ID
   * @param {string} status - New status
   * @param {string|null} errorMessage - Error message if status is 'error'
   * @returns {object|null} Updated link or null
   */
  updateStatus(linkId, status, errorMessage = null) {
    return this.update(linkId, {
      status,
      errorMessage: status === 'error' ? errorMessage : null,
    });
  },

  /**
   * Update last sync timestamp
   * @param {string} linkId - Belvo link ID
   * @returns {object|null} Updated link or null
   */
  updateLastSync(linkId) {
    return this.update(linkId, { lastSyncAt: new Date() });
  },

  /**
   * Delete a bank link
   * @param {string} linkId - Belvo link ID
   * @returns {boolean} True if deleted
   */
  delete(linkId) {
    for (const [phone, userLinks] of bankLinks.entries()) {
      const filtered = userLinks.filter(l => l.linkId !== linkId);
      if (filtered.length < userLinks.length) {
        bankLinks.set(phone, filtered);
        return true;
      }
    }
    return false;
  },

  /**
   * Count active bank links for a user
   * @param {string} phone - User's phone number
   * @returns {number} Count of active links
   */
  countActiveByUser(phone) {
    return this.getActiveByUser(phone).length;
  },
};

/**
 * Bank Import Usage tracking
 */
export const BankImportUsageDB = {
  /**
   * Get usage key for current period
   * @param {string} phone - User's phone number
   * @returns {string} Usage key
   */
  _getKey(phone) {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return `${phone}_${periodStart.toISOString().split('T')[0]}`;
  },

  /**
   * Get current period usage
   * @param {string} phone - User's phone number
   * @returns {number} Transactions imported this period
   */
  getUsage(phone) {
    const key = this._getKey(phone);
    return bankImportUsage.get(key) || 0;
  },

  /**
   * Increment usage
   * @param {string} phone - User's phone number
   * @param {number} count - Number of transactions to add
   * @returns {number} New usage count
   */
  increment(phone, count = 1) {
    const key = this._getKey(phone);
    const current = bankImportUsage.get(key) || 0;
    const newCount = current + count;
    bankImportUsage.set(key, newCount);
    return newCount;
  },

  /**
   * Check if user can import more transactions
   * @param {string} phone - User's phone number
   * @param {number} limit - Monthly limit
   * @param {number} count - Number to import
   * @returns {{allowed: boolean, used: number, remaining: number}}
   */
  canImport(phone, limit, count = 1) {
    const used = this.getUsage(phone);
    const remaining = Math.max(0, limit - used);
    return {
      allowed: remaining >= count,
      used,
      remaining,
      limit,
    };
  },
};

export default { BankLinkDB, BankImportUsageDB };
