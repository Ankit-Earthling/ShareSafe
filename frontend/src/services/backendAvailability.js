export function backendStatusFromHealth(health) {
  return health?.status === 'ok' ? 'connected' : 'unavailable'
}
