// In production VITE_API_URL is set to the API Gateway URL (no trailing slash).
// In local dev it is empty string, and the Vite proxy handles /api → localhost:3001.
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

// Generate a UUID v4.
// crypto.randomUUID() requires a secure context (HTTPS / localhost).
// The S3 static site uses HTTP, so we fall back to crypto.getRandomValues()
// which works in all contexts.
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 via getRandomValues (works on HTTP)
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  return [...b].map((v, i) =>
    ([4, 6, 8, 10].includes(i) ? '-' : '') + v.toString(16).padStart(2, '0')
  ).join('');
}

// Get or create a stable voter UUID stored in localStorage.
export function getVoterId() {
  let id = localStorage.getItem('memm_voter_id');
  if (!id) {
    id = generateUUID();
    localStorage.setItem('memm_voter_id', id);
  }
  return id;
}

async function req(url, opts = {}) {
  const { body, headers: optHeaders, ...restOpts } = opts;
  const res = await fetch(BASE + url, {
    headers: { 'Content-Type': 'application/json', ...optHeaders },
    ...restOpts,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, ...err };
  }
  return res.json();
}

function adminReq(url, opts = {}, token) {
  return req(url, { ...opts, headers: { ...opts.headers, 'x-admin-token': token } });
}

// ─── Public ───────────────────────────────────────────────────────────────────
export const getTournament = () => req('/tournament');
export const getMatchup    = id => req(`/matchups/${id}`);
export const getMatchups   = () => req('/matchups');

// voterId comes from localStorage, sent in the request body
export const vote = (matchupId, teamId) =>
  req(`/matchups/${matchupId}/vote`, {
    method: 'POST',
    body: { teamId, voterId: getVoterId() },
  });

// voterId sent as a query param for the GET vote-status check
export const getVoteStatus = (matchupId) =>
  req(`/matchups/${matchupId}/vote-status?voterId=${encodeURIComponent(getVoterId())}`);

export const getDashboard = () => req('/dashboard');

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminLogin     = password => req('/admin/login', { method: 'POST', body: { password } });
export const updateSettings = (body, token) => adminReq('/admin/settings', { method: 'PUT', body }, token);
export const updateRegion   = (id, body, token) => adminReq(`/admin/regions/${id}`, { method: 'PUT', body }, token);

export const createTeam = (body, token) => adminReq('/admin/teams', { method: 'POST', body }, token);
export const updateTeam = (id, body, token) => adminReq(`/admin/teams/${id}`, { method: 'PUT', body }, token);
export const deleteTeam = (id, token) => adminReq(`/admin/teams/${id}`, { method: 'DELETE' }, token);

export const uploadTeamImage = async (teamId, file, token) => {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${BASE}/admin/teams/${teamId}/image`, {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: fd,
  });
  if (!res.ok) throw await res.json().catch(() => ({ error: res.statusText }));
  return res.json();
};

export const uploadBracketImage = async (file, token) => {
  const fd = new FormData();
  fd.append('image', file);
  const res = await fetch(`${BASE}/admin/bracket/generate`, {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: fd,
  });
  if (!res.ok) throw await res.json().catch(() => ({ error: res.statusText }));
  return res.json();
};

export const initializeBracket = token => adminReq('/admin/initialize-bracket', { method: 'POST' }, token);
export const seedMatchup       = (id, body, token) => adminReq(`/admin/matchups/${id}/seed`, { method: 'PUT', body }, token);
export const setMatchupStatus  = (id, status, token) => adminReq(`/admin/matchups/${id}/status`, { method: 'PUT', body: { status } }, token);
export const setWinner         = (id, winnerId, token) => adminReq(`/admin/matchups/${id}/winner`, { method: 'POST', body: { winnerId } }, token);
export const resetVotes        = (id, token) => adminReq(`/admin/matchups/${id}/reset-votes`, { method: 'POST' }, token);

export const updateDashboard = (body, token) => adminReq('/admin/dashboard', { method: 'PUT', body }, token);
export const dashboardNext   = token => adminReq('/admin/dashboard/next', { method: 'POST' }, token);
export const dashboardPrev   = token => adminReq('/admin/dashboard/prev', { method: 'POST' }, token);

// ─── Staff Auth ───────────────────────────────────────────────────────────────

function staffReq(url, opts = {}) {
  const token = sessionStorage.getItem('memm_staff_token');
  return req(url, { ...opts, headers: { ...opts.headers, 'x-staff-token': token } });
}

export const staffLogin  = email => req('/staff/login', { method: 'POST', body: { email } });
export const getStaffMe  = () => staffReq('/staff/me');

// ─── Staff: Contender intake ─────────────────────────────────────────────────

export const getStaffContenders = () => staffReq('/staff/contenders');
export const checkDuplicate     = name => staffReq('/staff/contenders/check-duplicate', { method: 'POST', body: { name } });
export const submitContender    = body => staffReq('/staff/contenders', { method: 'POST', body });

// ─── Staff: Seeding ballot ───────────────────────────────────────────────────

export const getStaffBallot  = () => staffReq('/staff/ballot');
export const saveStaffBallot = (picks, status) => staffReq('/staff/ballot', { method: 'PUT', body: { picks, status } });
export const getBallotStats  = () => staffReq('/staff/ballot/stats');

// ─── Public: Seeding status ──────────────────────────────────────────────────

export const getSeedingStatus = () => req('/seeding/status');

// ─── Admin: Seeding ──────────────────────────────────────────────────────────

export const getSeedingData       = token => adminReq('/admin/seeding', {}, token);
export const updateSeedingConfig  = (body, token) => adminReq('/admin/seeding/config', { method: 'PUT', body }, token);
export const setSeedingPhase      = (phase, token) => adminReq('/admin/seeding/phase', { method: 'PUT', body: { phase } }, token);
export const importContenders     = (contenders, token) => adminReq('/admin/seeding/import', { method: 'POST', body: { contenders } }, token);

export const createContender      = (body, token) => adminReq('/admin/seeding/contenders', { method: 'POST', body }, token);
export const updateContender      = (id, body, token) => adminReq(`/admin/seeding/contenders/${id}`, { method: 'PUT', body }, token);
export const deleteContender      = (id, token) => adminReq(`/admin/seeding/contenders/${id}`, { method: 'DELETE' }, token);
export const toggleContenderSelected = (id, selected, token) => adminReq(`/admin/seeding/contenders/${id}/selected`, { method: 'PUT', body: { selected } }, token);
export const selectTopContenders  = (count, token) => adminReq('/admin/seeding/select-top', { method: 'POST', body: { count } }, token);

export const uploadContenderImage = async (contenderId, file, token) => {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch(`${BASE}/admin/seeding/contenders/${contenderId}/image`, {
    method: 'POST',
    headers: { 'x-admin-token': token },
    body: fd,
  });
  if (!r.ok) throw await r.json().catch(() => ({ error: r.statusText }));
  return r.json();
};

export const scrapeImages       = (contenderIds, token) => adminReq('/admin/seeding/scrape-images', { method: 'POST', body: { contenderIds } }, token);
export const computeRankings    = token => adminReq('/admin/seeding/compute-rankings', { method: 'POST' }, token);
export const assignDivisions    = (body, token) => adminReq('/admin/seeding/assign-divisions', { method: 'POST', body }, token);
export const finalizeSeeding    = (body, token) => adminReq('/admin/seeding/finalize', { method: 'POST', body }, token);
export const resetSeeding       = token => adminReq('/admin/seeding/reset', { method: 'DELETE' }, token);
export const resetBallot        = (email, token) => adminReq(`/admin/seeding/ballots/${encodeURIComponent(email)}`, { method: 'DELETE' }, token);
