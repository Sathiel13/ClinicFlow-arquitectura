const key = process.env.CF_CALCOM_API_KEY;

if (!key) {
  console.log(JSON.stringify({ ok: false, error: 'missing_CF_CALCOM_API_KEY' }));
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'cal-api-version': '2024-06-14',
};

async function api(path) {
  const res = await fetch(`https://api.cal.com${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body };
}

const flattenEventTypes = (body) => {
  const data = body?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.eventTypes)) return data.eventTypes;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(body?.eventTypes)) return body.eventTypes;
  return [];
};

const knownTestIds = new Set([
  6608043, 6608044, 6608045, 6608046, 6608047,
  6608048, 6608049, 6608050, 6608051, 6608052,
]);

const isTestEventType = (eventType) => {
  const slug = String(eventType.slug ?? '').toLowerCase();
  const title = String(eventType.title ?? eventType.name ?? '').toLowerCase();
  const id = Number(eventType.id);
  return knownTestIds.has(id) || slug.startsWith('cf-prueba-') || title.includes('cf-prueba');
};

async function main() {
  const listed = await api('/v2/event-types');
  if (listed.status >= 400) {
    console.log(JSON.stringify({ ok: false, status: listed.status, body: listed.body }, null, 2));
    process.exit(1);
  }
  const eventTypes = flattenEventTypes(listed.body);
  const testEventTypes = eventTypes.filter(isTestEventType).map((eventType) => ({
    id: eventType.id,
    slug: eventType.slug ?? null,
    title: eventType.title ?? eventType.name ?? null,
    lengthInMinutes: eventType.lengthInMinutes ?? eventType.length ?? null,
    teamId: eventType.teamId ?? eventType.team?.id ?? null,
  }));

  console.log(JSON.stringify({
    ok: true,
    count: testEventTypes.length,
    testEventTypes,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
