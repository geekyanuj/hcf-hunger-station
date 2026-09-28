import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, data, message });
}

export function sendPaginated<T>(
  res: Response,
  items: T[],
  pagination: { page: number; limit: number; total: number },
  message = 'Success'
) {
  return res.status(200).json({
    success: true,
    data: items,
    message,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit) || 1,
    },
  });
}
