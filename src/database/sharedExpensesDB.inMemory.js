/**
 * In-memory Shared Expenses Database
 * Stores expense groups, members, shared expenses, and splits
 */

import { nanoid } from 'nanoid';

// Store expense groups
const expenseGroups = new Map();
// Store group members
const groupMembers = new Map();
// Store shared expenses
const sharedExpenses = new Map();
// Store expense splits
const expenseSplits = new Map();

let sharedExpenseIdCounter = 1;
let splitIdCounter = 1;

/**
 * Generate a short unique ID for groups
 */
function generateGroupId() {
  return nanoid(8);
}

/**
 * Expense Groups operations
 */
export const ExpenseGroupDB = {
  /**
   * Create a new expense group
   * @param {string} createdBy - Creator's phone number
   * @param {object} data - Group data { name }
   * @returns {object} Created group
   */
  create(createdBy, data) {
    const group = {
      id: generateGroupId(),
      name: data.name,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expenseGroups.set(group.id, group);

    // Add creator as owner
    GroupMemberDB.add(group.id, createdBy, 'owner');

    return group;
  },

  /**
   * Get a group by ID
   * @param {string} groupId - Group ID
   * @returns {object|null} Group or null
   */
  get(groupId) {
    return expenseGroups.get(groupId) || null;
  },

  /**
   * Get all groups for a user (where they are a member)
   * @param {string} phone - User's phone number
   * @returns {Array} User's groups
   */
  getByUser(phone) {
    const userGroupIds = GroupMemberDB.getGroupIds(phone);
    return userGroupIds.map(id => expenseGroups.get(id)).filter(Boolean);
  },

  /**
   * Update a group
   * @param {string} groupId - Group ID
   * @param {object} updates - Fields to update
   * @returns {object|null} Updated group or null
   */
  update(groupId, updates) {
    const group = expenseGroups.get(groupId);
    if (!group) return null;

    const updated = {
      ...group,
      ...updates,
      updatedAt: new Date(),
    };
    expenseGroups.set(groupId, updated);
    return updated;
  },

  /**
   * Delete a group (and all related data)
   * @param {string} groupId - Group ID
   * @returns {boolean} True if deleted
   */
  delete(groupId) {
    if (!expenseGroups.has(groupId)) return false;

    // Delete all members
    groupMembers.delete(groupId);

    // Delete all shared expenses and their splits
    for (const [expId, expense] of sharedExpenses.entries()) {
      if (expense.groupId === groupId) {
        expenseSplits.delete(expId);
        sharedExpenses.delete(expId);
      }
    }

    expenseGroups.delete(groupId);
    return true;
  },

  /**
   * Find a group by name for a user
   * @param {string} phone - User's phone number
   * @param {string} name - Group name (partial match)
   * @returns {object|null} Matched group or null
   */
  findByName(phone, name) {
    const userGroups = this.getByUser(phone);
    const nameLower = name.toLowerCase();
    return userGroups.find(g => g.name.toLowerCase().includes(nameLower)) || null;
  },
};

/**
 * Group Members operations
 */
export const GroupMemberDB = {
  /**
   * Add a member to a group
   * @param {string} groupId - Group ID
   * @param {string} phone - Member's phone number
   * @param {string} role - 'owner' or 'member'
   * @returns {object} Created member record
   */
  add(groupId, phone, role = 'member') {
    const members = groupMembers.get(groupId) || [];

    // Check if already a member
    if (members.some(m => m.phone === phone)) {
      return members.find(m => m.phone === phone);
    }

    const member = {
      groupId,
      phone,
      role,
      joinedAt: new Date(),
    };

    members.push(member);
    groupMembers.set(groupId, members);
    return member;
  },

  /**
   * Get all members of a group
   * @param {string} groupId - Group ID
   * @returns {Array} Group members
   */
  getByGroup(groupId) {
    return groupMembers.get(groupId) || [];
  },

  /**
   * Get all group IDs for a user
   * @param {string} phone - User's phone number
   * @returns {Array<string>} Group IDs
   */
  getGroupIds(phone) {
    const ids = [];
    for (const [groupId, members] of groupMembers.entries()) {
      if (members.some(m => m.phone === phone)) {
        ids.push(groupId);
      }
    }
    return ids;
  },

  /**
   * Remove a member from a group
   * @param {string} groupId - Group ID
   * @param {string} phone - Member's phone number
   * @returns {boolean} True if removed
   */
  remove(groupId, phone) {
    const members = groupMembers.get(groupId) || [];
    const filtered = members.filter(m => m.phone !== phone);
    if (filtered.length < members.length) {
      groupMembers.set(groupId, filtered);
      return true;
    }
    return false;
  },

  /**
   * Check if user is a member of a group
   * @param {string} groupId - Group ID
   * @param {string} phone - User's phone number
   * @returns {boolean}
   */
  isMember(groupId, phone) {
    const members = groupMembers.get(groupId) || [];
    return members.some(m => m.phone === phone);
  },

  /**
   * Check if user is owner of a group
   * @param {string} groupId - Group ID
   * @param {string} phone - User's phone number
   * @returns {boolean}
   */
  isOwner(groupId, phone) {
    const members = groupMembers.get(groupId) || [];
    return members.some(m => m.phone === phone && m.role === 'owner');
  },
};

/**
 * Shared Expenses operations
 */
export const SharedExpenseDB = {
  /**
   * Create a shared expense
   * @param {string} creatorPhone - Creator's phone number
   * @param {object} data - Expense data
   * @returns {object} Created shared expense
   */
  create(creatorPhone, data) {
    const expense = {
      id: sharedExpenseIdCounter++,
      groupId: data.groupId || null,
      creatorPhone,
      amount: data.amount,
      category: data.category,
      description: data.description || '',
      splitType: data.splitType || 'equal',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sharedExpenses.set(expense.id, expense);
    return expense;
  },

  /**
   * Get a shared expense by ID
   * @param {number} expenseId - Expense ID
   * @returns {object|null} Expense or null
   */
  get(expenseId) {
    return sharedExpenses.get(expenseId) || null;
  },

  /**
   * Get shared expenses for a group
   * @param {string} groupId - Group ID
   * @returns {Array} Group's shared expenses
   */
  getByGroup(groupId) {
    const expenses = [];
    for (const expense of sharedExpenses.values()) {
      if (expense.groupId === groupId) {
        expenses.push(expense);
      }
    }
    return expenses.sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * Get shared expenses created by a user
   * @param {string} phone - User's phone number
   * @returns {Array} User's created shared expenses
   */
  getByCreator(phone) {
    const expenses = [];
    for (const expense of sharedExpenses.values()) {
      if (expense.creatorPhone === phone) {
        expenses.push(expense);
      }
    }
    return expenses.sort((a, b) => b.createdAt - a.createdAt);
  },

  /**
   * Get shared expenses where user has a split
   * @param {string} phone - User's phone number
   * @returns {Array} Expenses with user splits
   */
  getByParticipant(phone) {
    const expenseIds = ExpenseSplitDB.getExpenseIdsByMember(phone);
    return expenseIds.map(id => sharedExpenses.get(id)).filter(Boolean);
  },

  /**
   * Delete a shared expense
   * @param {number} expenseId - Expense ID
   * @returns {boolean} True if deleted
   */
  delete(expenseId) {
    if (!sharedExpenses.has(expenseId)) return false;
    expenseSplits.delete(expenseId);
    sharedExpenses.delete(expenseId);
    return true;
  },
};

/**
 * Expense Splits operations
 */
export const ExpenseSplitDB = {
  /**
   * Create splits for a shared expense
   * @param {number} expenseId - Expense ID
   * @param {Array} splits - Array of { phone, amount }
   * @returns {Array} Created splits
   */
  createMany(expenseId, splits) {
    const created = [];
    const expSplits = expenseSplits.get(expenseId) || [];

    for (const split of splits) {
      const record = {
        id: splitIdCounter++,
        expenseId,
        memberPhone: split.phone,
        amount: split.amount,
        status: 'pending',
        paidAt: null,
        createdAt: new Date(),
      };
      expSplits.push(record);
      created.push(record);
    }

    expenseSplits.set(expenseId, expSplits);
    return created;
  },

  /**
   * Get splits for an expense
   * @param {number} expenseId - Expense ID
   * @returns {Array} Expense splits
   */
  getByExpense(expenseId) {
    return expenseSplits.get(expenseId) || [];
  },

  /**
   * Get expense IDs where a user has a split
   * @param {string} phone - User's phone number
   * @returns {Array<number>} Expense IDs
   */
  getExpenseIdsByMember(phone) {
    const ids = [];
    for (const [expenseId, splits] of expenseSplits.entries()) {
      if (splits.some(s => s.memberPhone === phone)) {
        ids.push(expenseId);
      }
    }
    return ids;
  },

  /**
   * Get all splits for a user (what they owe)
   * @param {string} phone - User's phone number
   * @param {string} status - Filter by status ('pending', 'paid', or null for all)
   * @returns {Array} User's splits with expense info
   */
  getByMember(phone, status = null) {
    const result = [];
    for (const [expenseId, splits] of expenseSplits.entries()) {
      for (const split of splits) {
        if (split.memberPhone === phone) {
          if (!status || split.status === status) {
            const expense = sharedExpenses.get(expenseId);
            result.push({ ...split, expense });
          }
        }
      }
    }
    return result;
  },

  /**
   * Mark a split as paid
   * @param {number} splitId - Split ID
   * @returns {object|null} Updated split or null
   */
  markPaid(splitId) {
    for (const [expenseId, splits] of expenseSplits.entries()) {
      const idx = splits.findIndex(s => s.id === splitId);
      if (idx !== -1) {
        splits[idx] = {
          ...splits[idx],
          status: 'paid',
          paidAt: new Date(),
        };
        expenseSplits.set(expenseId, splits);
        return splits[idx];
      }
    }
    return null;
  },

  /**
   * Mark a split as paid by expense and member
   * @param {number} expenseId - Expense ID
   * @param {string} phone - Member's phone number
   * @returns {object|null} Updated split or null
   */
  markPaidByMember(expenseId, phone) {
    const splits = expenseSplits.get(expenseId) || [];
    const idx = splits.findIndex(s => s.memberPhone === phone);
    if (idx !== -1) {
      splits[idx] = {
        ...splits[idx],
        status: 'paid',
        paidAt: new Date(),
      };
      expenseSplits.set(expenseId, splits);
      return splits[idx];
    }
    return null;
  },

  /**
   * Calculate balances between users
   * Returns who owes whom and how much
   * @param {string} phone - User's phone number
   * @returns {{owes: Array, owed: Array, netBalance: number}}
   */
  calculateBalances(phone) {
    // What this user owes others (pending splits where they are the member)
    const owes = new Map(); // creditorPhone -> amount

    // What others owe this user (pending splits on expenses they created)
    const owed = new Map(); // debtorPhone -> amount

    // Process splits where user is a member (what they owe)
    for (const [expenseId, splits] of expenseSplits.entries()) {
      const expense = sharedExpenses.get(expenseId);
      if (!expense) continue;

      for (const split of splits) {
        if (split.status === 'pending') {
          if (split.memberPhone === phone && expense.creatorPhone !== phone) {
            // User owes the creator
            const current = owes.get(expense.creatorPhone) || 0;
            owes.set(expense.creatorPhone, current + split.amount);
          } else if (expense.creatorPhone === phone && split.memberPhone !== phone) {
            // Someone owes the user
            const current = owed.get(split.memberPhone) || 0;
            owed.set(split.memberPhone, current + split.amount);
          }
        }
      }
    }

    // Calculate net balances
    const netBalances = new Map();
    for (const [creditor, amount] of owes.entries()) {
      netBalances.set(creditor, -(amount));
    }
    for (const [debtor, amount] of owed.entries()) {
      const current = netBalances.get(debtor) || 0;
      netBalances.set(debtor, current + amount);
    }

    // Format results
    const owesArray = [];
    const owedArray = [];
    let netBalance = 0;

    for (const [person, net] of netBalances.entries()) {
      if (net < 0) {
        owesArray.push({ phone: person, amount: Math.abs(net) });
        netBalance += net;
      } else if (net > 0) {
        owedArray.push({ phone: person, amount: net });
        netBalance += net;
      }
    }

    return { owes: owesArray, owed: owedArray, netBalance };
  },

  /**
   * Settle debt between two users
   * Marks all pending splits between them as paid
   * @param {string} payerPhone - Who is paying
   * @param {string} creditorPhone - Who is receiving
   * @returns {number} Amount settled
   */
  settleDebt(payerPhone, creditorPhone) {
    let totalSettled = 0;

    for (const [expenseId, splits] of expenseSplits.entries()) {
      const expense = sharedExpenses.get(expenseId);
      if (!expense) continue;

      // Find splits where payer owes creditor
      if (expense.creatorPhone === creditorPhone) {
        for (let i = 0; i < splits.length; i++) {
          if (splits[i].memberPhone === payerPhone && splits[i].status === 'pending') {
            totalSettled += splits[i].amount;
            splits[i] = {
              ...splits[i],
              status: 'paid',
              paidAt: new Date(),
            };
          }
        }
        expenseSplits.set(expenseId, splits);
      }
    }

    return totalSettled;
  },
};

export default {
  ExpenseGroupDB,
  GroupMemberDB,
  SharedExpenseDB,
  ExpenseSplitDB,
};
