const key = process.env.CF_CALCOM_API_KEY;
const teamId = process.argv[2] || '254718';

if (!key) {
  console.log(JSON.stringify({ ok: false, error: 'missing_CF_CALCOM_API_KEY' }));
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'cal-api-version': '2024-09-04',
};

async function api(path) {
  const res = await fetch(`https://api.cal.com/v2${path}`, { headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, body };
}

async function main() {
  const memberships = await api(`/teams/${teamId}/memberships`);
  console.log(JSON.stringify({
    ok: memberships.status < 400,
    status: memberships.status,
    members: Array.isArray(memberships.body?.data)
      ? memberships.body.data.map(m => ({
          membershipId: m.id,
          userId: m.userId,
          role: m.role,
          accepted: m.accepted,
          email: m.user?.email ?? null,
          name: m.user?.name ?? null,
          username: m.user?.username ?? null,
        }))
      : memberships.body,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
