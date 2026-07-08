/**
 * Fetch HTTP com suporte opcional a proxy corporativo (certificado autoassinado).
 * Ative com SNOW_TLS_INSECURE=true quando fetch falhar com SELF_SIGNED_CERT_IN_CHAIN.
 */

if (process.env.SNOW_TLS_INSECURE === 'true') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * @param {string|URL} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export function snowFetch(url, options = {}) {
  return fetch(url, options);
}
