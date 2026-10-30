const key = process.env.CF_CALCOM_API_KEY;
const teamId = process.argv[2] || '254718';
if (!key) throw new Error('missing_CF_CALCOM_API_KEY');

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'cal-api-version': '2024-09-04',
};

async function api(path, options = {}) {
  const res = await fetch(`https://api.cal.com/v2${path}`, { ...options, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, body };
}

async function main() {
  const invite = await api(`/teams/${teamId}/invite`, { method: 'POST' });
  const memberships = await api(`/teams/${teamId}/memberships`);
  console.log(JSON.stringify({
    teamId,
    invite: {
      status: invite.status,
      inviteLink: invite.body?.data?.inviteLink ?? null,
      error: invite.status >= 400 ? invite.body : null,
    },
    memberships: {
      status: memberships.status,
      count: Array.isArray(memberships.body?.data) ? memberships.body.data.length : null,
      sample: Array.isArray(memberships.body?.data)
        ? memberships.body.data.slice(0, 10).map(m => ({
            id: m.id,
            userId: m.userId,
            role: m.role,
            accepted: m.accepted,
            email: m.user?.email ? '[hidden]' : null,
            name: m.user?.name ?? null,
          }))
        : memberships.body,
    },
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: err.message }, null, 2));
  process.exit(1);
});
