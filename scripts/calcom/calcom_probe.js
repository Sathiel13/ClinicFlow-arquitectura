const paths = ['/v2/me', '/v2/teams', '/v2/organizations'];

const key = process.env.CF_CALCOM_API_KEY;
if (!key) {
  console.log(JSON.stringify({ error: 'missing_CF_CALCOM_API_KEY' }));
  process.exit(1);
}

const scrub = (value) => {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (/email|token|key|secret/i.test(k)) out[k] = v ? '[hidden]' : v;
    else out[k] = scrub(v);
  }
  return out;
};

async function main() {
  const result = {};
  for (const path of paths) {
    const res = await fetch(`https://api.cal.com${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        'cal-api-version': '2024-09-04',
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    result[path] = { status: res.status, body: scrub(body) };
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
