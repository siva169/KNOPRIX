export function isProviderAvailable(provider) {
  if (!provider) return false;
  if (provider.id === 'nvidia-nim') return provider.hasServerKey === true;
  return provider.browserAvailable !== false;
}
