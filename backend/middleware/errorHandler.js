export function errorHandler(error, _request, response, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500
  const message = error.expose ? error.message : status >= 500 ? 'Internal server error.' : error.message

  if (status >= 500 && !error.expose) {
    console.error('Unhandled request error.')
  }

  response.status(status).json({ message })
}
