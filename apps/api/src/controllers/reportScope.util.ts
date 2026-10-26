import { Request } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '../utils/ApiError';

const BUSINESS_TIME_ZONE = 'Asia/Kolkata';
const BUSINESS_TIME_ZONE_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function addCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function businessDayStart(date: Date): Date {
  return new Date(date.getTime() - BUSINESS_TIME_ZONE_OFFSET_MS);
}

function currentBusinessDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((value) => value.type === type)?.value);
  const date = new Date(0);
  date.setUTCFullYear(part('year'), part('month') - 1, part('day'));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

/**
 * Resolves the outlet(s) a reporting/analytics/dashboard request is allowed
 * to see: `?outletId=ALL` is only honored for OWNER accounts (spec: "Owner
 * can select ALL OUTLETS... Managers should normally only access assigned
 * outlet(s)"). A specific `?outletId=` must be one the requesting staff
 * member is actually assigned to, unless they're an OWNER.
 */
export function resolveOutletScope(req: Request): string[] | 'ALL' {
  if (!req.auth || req.auth.type !== 'STAFF') throw ApiError.forbidden('Staff access required');

  const requestedValue = req.query.outletId;
  if (requestedValue !== undefined && typeof requestedValue !== 'string') {
    throw ApiError.badRequest('outletId must be a single outlet ID');
  }
  const requested = requestedValue as string | undefined;

  if (req.auth.role === 'OWNER') {
    if (!requested || requested === 'ALL') return 'ALL';
    if (!Types.ObjectId.isValid(requested)) throw ApiError.badRequest('Invalid outletId');
    return [requested];
  }

  if (!requested || requested === 'ALL') return req.auth.outletIds;

  if (!Types.ObjectId.isValid(requested)) throw ApiError.badRequest('Invalid outletId');
  if (!req.auth.outletIds.includes(requested)) {
    throw ApiError.forbidden('You do not have access to this outlet');
  }
  return [requested];
}

export function parseDateRange(req: Request): { from: Date; to: Date } {
  const rangeValue = req.query.range;
  if (rangeValue !== undefined && typeof rangeValue !== 'string') {
    throw ApiError.badRequest('range must be a single supported value');
  }
  const preset = rangeValue as string | undefined;
  const today = currentBusinessDate(new Date());
  const startOfToday = businessDayStart(today);
  const endOfToday = new Date(businessDayStart(addCalendarDays(today, 1)).getTime() - 1);

  // Explicit custom dates take precedence over presets. Both endpoints are required.
  if (req.query.from !== undefined || req.query.to !== undefined) {
    if (typeof req.query.from !== 'string' || typeof req.query.to !== 'string') {
      throw ApiError.badRequest('Both from and to query parameters are required for a custom date range');
    }
    const parseBusinessDate = (value: string): Date | null => {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
      if (!match) return null;
      const date = new Date(0);
      date.setUTCFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      date.setUTCHours(0, 0, 0, 0);
      if (
        date.getUTCFullYear() !== Number(match[1])
        || date.getUTCMonth() !== Number(match[2]) - 1
        || date.getUTCDate() !== Number(match[3])
      ) return null;
      return date;
    };
    const fromDate = parseBusinessDate(req.query.from);
    const toDate = parseBusinessDate(req.query.to);
    if (!fromDate || !toDate) {
      throw ApiError.badRequest('Invalid from/to date. Use YYYY-MM-DD format');
    }
    if (fromDate > toDate) throw ApiError.badRequest('The from date must be on or before the to date');
    const from = businessDayStart(fromDate);
    const to = new Date(businessDayStart(addCalendarDays(toDate, 1)).getTime() - 1);
    return { from, to };
  }

  const supportedRanges = ['today', 'yesterday', 'last7days', 'last30days', 'thisWeek', 'thisMonth'];
  if (preset && !supportedRanges.includes(preset)) {
    throw ApiError.badRequest('Unsupported date range');
  }

  switch (preset) {
    case 'yesterday': {
      const from = businessDayStart(addCalendarDays(today, -1));
      const to = new Date(startOfToday.getTime() - 1);
      return { from, to };
    }
    case 'last7days': {
      const from = businessDayStart(addCalendarDays(today, -6));
      return { from, to: endOfToday };
    }
    case 'last30days': {
      const from = businessDayStart(addCalendarDays(today, -29));
      return { from, to: endOfToday };
    }
    case 'thisWeek': {
      const daysSinceMonday = (today.getUTCDay() + 6) % 7;
      const from = businessDayStart(addCalendarDays(today, -daysSinceMonday));
      return { from, to: endOfToday };
    }
    case 'thisMonth': {
      const monthStart = new Date(today);
      monthStart.setUTCDate(1);
      const from = businessDayStart(monthStart);
      return { from, to: endOfToday };
    }
    case 'today':
    default:
      return { from: startOfToday, to: endOfToday };
  }
}
