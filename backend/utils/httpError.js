export function httpError(status, message, { expose = false } = {}) {
  const error = new Error(message)
  error.status = status
  error.expose = expose
  return error
}
