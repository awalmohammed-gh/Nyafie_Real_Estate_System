// Consistent API responses: { success, message, data }
export const ok = (res, data = null, message = "OK", status = 200) =>
  res.status(status).json({ success: true, message, data });

export const fail = (res, status, message) => res.status(status).json({ success: false, message });

// Wraps async route handlers so thrown errors reach the error handler
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Error with an HTTP status that is safe to show to users
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
