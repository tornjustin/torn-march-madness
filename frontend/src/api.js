// In production VITE_API_URL is set to the API Gateway URL (no trailing slash).
// In local dev it is empty string, and the Vite proxy handles /api → localhost:3001.
const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

// Get or create a stable voter UUID stored in localStorage.
export function getVoterId() {
  let id = localStorage.getItem('memm_voter_id');
  if (!id) {
    id = crypto.randomUUID();
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

export const initializeBracket = token => adminReq('/admin/initialize-bracket', { method: 'POST' }, token);
export const seedMatchup       = (id, body, token) => adminReq(`/admin/matchups/${id}/seed`, { method: 'PUT', body }, token);
export const setMatchupStatus  = (id, status, token) => adminReq(`/admin/matchups/${id}/status`, { method: 'PUT', body: { status } }, token);
export const setWinner         = (id, winnerId, token) => adminReq(`/admin/matchups/${id}/winner`, { method: 'POST', body: { winnerId } }, token);
export const resetVotes        = (id, token) => adminReq(`/admin/matchups/${id}/reset-votes`, { method: 'POST' }, token);

export const updateDashboard = (body, token) => adminReq('/admin/dashboard', { method: 'PUT', body }, token);
export const dashboardNext   = token => adminReq('/admin/dashboard/next', { method: 'POST' }, token);
export const dashboardPrev   = token => adminReq('/admin/dashboard/prev', { method: 'POST' }, token);
