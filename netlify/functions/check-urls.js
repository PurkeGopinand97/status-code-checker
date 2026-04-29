const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let urls;
  try {
    ({ urls } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!Array.isArray(urls) || urls.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'urls array required' }) };
  }

  const results = await Promise.all(urls.slice(0, 50).map(checkUrl));

  return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
};

function normalizeUrl(raw) {
  const url = String(raw).trim();
  if (!url) return null;
  const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try { new URL(withProto); return withProto; } catch { return null; }
}

async function checkUrl(rawUrl, maxHops = 10) {
  const startTime = Date.now();
  const originalUrl = String(rawUrl).trim();
  const first = normalizeUrl(originalUrl);

  if (!first) {
    return { originalUrl, finalUrl: originalUrl, statusCode: null, error: 'Invalid URL', redirects: 0, responseTime: 0 };
  }

  let currentUrl = first;
  let hops = 0;

  while (hops <= maxHops) {
    let res;
    try {
      res = await fetchWithTimeout(currentUrl, 'HEAD');
    } catch (e) {
      if (hops === 0) {
        // HEAD not supported or network error — try GET
        try {
          res = await fetchWithTimeout(currentUrl, 'GET');
        } catch (e2) {
          return {
            originalUrl, finalUrl: currentUrl, statusCode: null,
            error: e2.name === 'AbortError' ? 'Timeout' : e2.message,
            redirects: hops, responseTime: Date.now() - startTime,
          };
        }
      } else {
        return {
          originalUrl, finalUrl: currentUrl, statusCode: null,
          error: e.name === 'AbortError' ? 'Timeout' : e.message,
          redirects: hops, responseTime: Date.now() - startTime,
        };
      }
    }

    const { status } = res;

    if (status >= 300 && status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        break;
      }
      hops++;
    } else {
      return {
        originalUrl, finalUrl: currentUrl, statusCode: status,
        redirects: hops, responseTime: Date.now() - startTime,
      };
    }
  }

  return {
    originalUrl, finalUrl: currentUrl, statusCode: null,
    error: 'Too many redirects', redirects: hops, responseTime: Date.now() - startTime,
  };
}

async function fetchWithTimeout(url, method, ms = 10000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 StatusCodeChecker/1.0' },
    });
  } finally {
    clearTimeout(tid);
  }
}
