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

  let sitemapUrl;
  try {
    ({ sitemapUrl } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  if (!sitemapUrl) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'sitemapUrl required' }) };
  }

  try {
    const urls = await extractUrls(sitemapUrl, 2);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ urls, total: urls.length }) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

async function fetchXml(url) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 StatusCodeChecker/1.0', 'Accept': 'application/xml,text/xml,*/*' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching sitemap`);
    return res.text();
  } finally {
    clearTimeout(tid);
  }
}

function parseLocTags(xml) {
  return [...xml.matchAll(/<loc[^>]*>\s*(.*?)\s*<\/loc>/gs)].map(m => m[1].trim());
}

function isSitemapIndex(xml) {
  return /<sitemapindex[\s>]/i.test(xml);
}

async function extractUrls(url, depth) {
  const xml = await fetchXml(url);

  if (isSitemapIndex(xml)) {
    if (depth <= 0) return [];
    const childUrls = parseLocTags(xml);
    const nested = await Promise.all(
      childUrls.slice(0, 15).map(u => extractUrls(u, depth - 1).catch(() => []))
    );
    return nested.flat();
  }

  return parseLocTags(xml);
}
