/**
 * Timezone utilities for user local time calculations
 */

// Map phone country codes to IANA timezones
// Using the most common/capital city timezone for each country
const COUNTRY_CODE_TO_TIMEZONE = {
  '1': 'America/New_York',      // USA (using Eastern as default)
  '44': 'Europe/London',        // UK
  '49': 'Europe/Berlin',        // Germany
  '33': 'Europe/Paris',         // France
  '34': 'Europe/Madrid',        // Spain
  '39': 'Europe/Rome',          // Italy
  '31': 'Europe/Amsterdam',     // Netherlands
  '32': 'Europe/Brussels',      // Belgium
  '43': 'Europe/Vienna',        // Austria
  '351': 'Europe/Lisbon',       // Portugal
  '353': 'Europe/Dublin',       // Ireland
  '358': 'Europe/Helsinki',     // Finland
  '30': 'Europe/Athens',        // Greece
  '57': 'America/Bogota',       // Colombia
  '52': 'America/Mexico_City',  // Mexico
  '55': 'America/Sao_Paulo',    // Brazil
  '54': 'America/Argentina/Buenos_Aires', // Argentina
  '56': 'America/Santiago',     // Chile
  '51': 'America/Lima',         // Peru
  '58': 'America/Caracas',      // Venezuela
  '593': 'America/Guayaquil',   // Ecuador
  '591': 'America/La_Paz',      // Bolivia
  '595': 'America/Asuncion',    // Paraguay
  '598': 'America/Montevideo',  // Uruguay
  '507': 'America/Panama',      // Panama
  '506': 'America/Costa_Rica',  // Costa Rica
  '81': 'Asia/Tokyo',           // Japan
  '82': 'Asia/Seoul',           // South Korea
  '86': 'Asia/Shanghai',        // China
  '91': 'Asia/Kolkata',         // India
  '61': 'Australia/Sydney',     // Australia
  '64': 'Pacific/Auckland',     // New Zealand
  '41': 'Europe/Zurich',        // Switzerland
  '46': 'Europe/Stockholm',     // Sweden
  '47': 'Europe/Oslo',          // Norway
  '45': 'Europe/Copenhagen',    // Denmark
  '48': 'Europe/Warsaw',        // Poland
  '7': 'Europe/Moscow',         // Russia
  '90': 'Europe/Istanbul',      // Turkey
  '27': 'Africa/Johannesburg',  // South Africa
  '971': 'Asia/Dubai',          // UAE
  '966': 'Asia/Riyadh',         // Saudi Arabia
  '65': 'Asia/Singapore',       // Singapore
  '852': 'Asia/Hong_Kong',      // Hong Kong
  '60': 'Asia/Kuala_Lumpur',    // Malaysia
  '66': 'Asia/Bangkok',         // Thailand
  '63': 'Asia/Manila',          // Philippines
  '62': 'Asia/Jakarta',         // Indonesia
  '84': 'Asia/Ho_Chi_Minh',     // Vietnam
};

/**
 * Get timezone from phone number
 * @param {string} phone - Phone number (may include + prefix)
 * @returns {string} IANA timezone identifier
 */
export function getTimezoneFromPhone(phone) {
  if (!phone) return 'UTC';

  // Remove + prefix and any non-digit characters
  const cleanPhone = phone.replace(/\D/g, '');

  // Try matching country codes from longest to shortest (3, 2, 1 digits)
  for (const length of [3, 2, 1]) {
    const prefix = cleanPhone.substring(0, length);
    if (COUNTRY_CODE_TO_TIMEZONE[prefix]) {
      return COUNTRY_CODE_TO_TIMEZONE[prefix];
    }
  }

  return 'UTC';
}

/**
 * Get the current hour in a specific timezone
 * @param {string} timezone - IANA timezone identifier (e.g., 'America/Bogota')
 * @returns {number} Hour (0-23)
 */
export function getCurrentHourInTimezone(timezone) {
  try {
    const now = new Date();
    const options = {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const hour = parseInt(formatter.format(now), 10);
    return hour;
  } catch (error) {
    console.error(`Error getting hour for timezone ${timezone}:`, error.message);
    // Fallback to UTC
    return new Date().getUTCHours();
  }
}

/**
 * Get the current hour for a user based on their phone number
 * @param {string} phone - User's phone number
 * @returns {number} Hour (0-23) in user's local timezone
 */
export function getUserLocalHour(phone) {
  const timezone = getTimezoneFromPhone(phone);
  return getCurrentHourInTimezone(timezone);
}

/**
 * Get time of day category for a user
 * @param {string} phone - User's phone number
 * @returns {'morning' | 'afternoon' | 'evening' | 'night'}
 */
export function getUserTimeOfDay(phone) {
  const hour = getUserLocalHour(phone);

  if (hour >= 5 && hour < 12) {
    return 'morning';
  } else if (hour >= 12 && hour < 18) {
    return 'afternoon';
  } else if (hour >= 18 && hour < 22) {
    return 'evening';
  } else {
    return 'night';
  }
}

/**
 * Check if current time in user's timezone is within a range
 * @param {string} phone - User's phone number
 * @param {number} startHour - Start hour (inclusive)
 * @param {number} endHour - End hour (exclusive)
 * @returns {boolean}
 */
export function isUserInTimeRange(phone, startHour, endHour) {
  const hour = getUserLocalHour(phone);
  return hour >= startHour && hour < endHour;
}
