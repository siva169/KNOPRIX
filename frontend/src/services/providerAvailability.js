export function isBrowserProviderAvailable(provider) {
  // Keep NVIDIA blocked if an older API deployment omits availability metadata.
  return Boolean(provider)
    && provider.id !== 'nvidia-nim'
    && provider.browserAvailable !== false;
}
