const key = process.env.CF_CALCOM_API_KEY;
const ids = process.argv.slice(2);

if (!key) {
  console.log(JSON.stringify({ ok: false, error: 'missing_CF_CALCOM_API_KEY' }));
  process.exit(1);
}

const eventTypeIds = ids.length > 0 ? ids : ['6740699', '6740700', '6740701', '6740702', '6740703', '6740704'];
const now = new Date();
const start = now.toISOString();
const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

async function main() {
  const result = [];
  for (const id of eventTypeIds) {
    const url = new URL('https://api.cal.com/v2/slots');
    url.searchParams.set('eventTypeId', id);
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('timeZone', 'America/Mexico_City');
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key}`,
        'cal-api-version': '2024-09-04',
      },
    });
    const body = await res.json().catch(() => ({}));
    let count = 0;
    let first = null;
    if (body?.status === 'success' && body?.data) {
      for (const slots of Object.values(body.data)) {
        if (Array.isArray(slots)) {
          count += slots.length;
          if (!first && slots[0]?.start) first = slots[0].start;
        }
      }
    }
    result.push({ eventTypeId: id, status: res.status, apiStatus: body?.status ?? null, slotCount30Days: count, firstSlot: first });
  }
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
