import { env } from '../config/env.js'
import { httpError } from '../utils/httpError.js'

export function requireFrontendOrigin(request, _response, next) {
  const origin = request.get('origin')
  if (!origin || origin !== env.frontendUrl) {
    return next(httpError(403, 'This request origin is not allowed.'))
  }
  return next()
}
