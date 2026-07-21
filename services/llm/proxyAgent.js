/*
 * EXPERIMENTAL FEATURE: Proxy Layer
 *
 * Proxy Layer реализован как архитектурный фундамент.
 * Функциональность временно отключена из рабочей версии.
 *
 * Причина:
 * не удалось добиться стабильной работы OpenRouter через proxy.
 *
 * При необходимости функциональность можно восстановить,
 * раскомментировав UI в public/admin.html и повторно протестировав интеграцию.
 *
 * Удалять данный код не следует.
 *
 * Для повторной активации:
 * 1. Вернуть UI (раскомментировать proxy-section в admin.html)
 * 2. Протестировать HTTP и SOCKS proxy
 * 3. Проверить getCredits()
 * 4. Проверить streaming
 * 5. Проверить listModels()
 * 6. После успешного тестирования снять статус Experimental
 */

let _HttpsProxyAgent = null;
let _SocksProxyAgent = null;

async function _ensureAgents() {
  if (!_HttpsProxyAgent) {
    const mod = await import('https-proxy-agent');
    _HttpsProxyAgent = mod.HttpsProxyAgent;
  }
  if (!_SocksProxyAgent) {
    const mod = await import('socks-proxy-agent');
    _SocksProxyAgent = mod.SocksProxyAgent;
  }
}

async function createProxyAgent(proxyConfig) {
  if (!proxyConfig || !proxyConfig.enabled) {
    return null;
  }

  const { type, host, port, username, password } = proxyConfig;
  if (!host || !port) {
    return null;
  }

  const auth = username
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password || '')}@`
    : '';

  await _ensureAgents();

  switch (type) {
    case 'socks4':
    case 'socks5':
      return new _SocksProxyAgent(`${type}://${auth}${host}:${port}`);
    case 'socks':
      return new _SocksProxyAgent(`socks5://${auth}${host}:${port}`);
    case 'http':
    default:
      return new _HttpsProxyAgent(`http://${auth}${host}:${port}`);
  }
}

module.exports = { createProxyAgent };