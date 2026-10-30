const key = process.env.CF_CALCOM_API_KEY;
const base = 'https://api.cal.com/v2';
const teamName = 'Clinica especialidades-prueba';
const teamSlug = 'clinica-especialidades-prueba';

if (!key) {
  console.log(JSON.stringify({ ok: false, error: 'missing_CF_CALCOM_API_KEY' }));
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  'cal-api-version': '2024-09-04',
};

async function api(path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body };
}

function publicTeam(team) {
  if (!team) return null;
  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    timeZone: team.timeZone,
    weekStart: team.weekStart,
    isPrivate: team.isPrivate,
  };
}

async function main() {
  const listed = await api('/teams');
  if (listed.status >= 400) {
    console.log(JSON.stringify({ ok: false, step: 'list_teams', status: listed.status, body: listed.body }, null, 2));
    process.exit(1);
  }

  const teams = Array.isArray(listed.body?.data) ? listed.body.data : [];
  let team = teams.find((t) => t.slug === teamSlug || t.name === teamName);
  let created = false;
  let createResponse = null;

  if (!team) {
    const payload = {
      name: teamName,
      slug: teamSlug,
      bio: 'Agenda medica por WhatsApp para ClinicFlow.',
      isPrivate: false,
      hideBookATeamMember: true,
      timeZone: 'America/Mexico_City',
      weekStart: 'Monday',
      autoAcceptCreator: true,
      metadata: {
        clinicflow: true,
        clinic: 'especialidades-prueba',
      },
    };

    createResponse = await api('/teams', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (![200, 201].includes(createResponse.status)) {
      console.log(JSON.stringify({ ok: false, step: 'create_team', status: createResponse.status, body: createResponse.body }, null, 2));
      process.exit(1);
    }

    team = createResponse.body?.data?.pendingTeam ?? createResponse.body?.data;
    created = true;
  }

  const teamId = team?.id;
  let invite = null;
  if (teamId) {
    const inviteResponse = await api(`/teams/${teamId}/invite`, { method: 'POST' });
    invite = {
      status: inviteResponse.status,
      inviteLink: inviteResponse.body?.data?.inviteLink ?? null,
      error: inviteResponse.status >= 400 ? inviteResponse.body : null,
    };
  }

  const membershipsResponse = teamId ? await api(`/teams/${teamId}/memberships`) : null;
  const memberships = Array.isArray(membershipsResponse?.body?.data)
    ? membershipsResponse.body.data.map((m) => ({
        id: m.id,
        userId: m.userId,
        role: m.role,
        accepted: m.accepted,
        email: m.user?.email ?? null,
        name: m.user?.name ?? null,
      }))
    : [];

  console.log(JSON.stringify({
    ok: true,
    created,
    team: publicTeam(team),
    paymentLink: createResponse?.body?.data?.paymentLink ?? null,
    invite,
    memberships,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
