# ⚔ Middle-earth March Madness (MEMM)

A full-stack voting app for the annual MEMM tournament at TheOneRing.net.

## Quick Start

You need **Node.js 18+** installed.

### 1. Install dependencies

```bash
# From the project root (memm/)
npm install           # installs concurrently

cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure admin password

Edit `.env` in the project root:
```
ADMIN_PASSWORD=your_password_here
PORT=3001
```

### 3. Run both servers

```bash
# From the project root:
npm run dev
```

- **Frontend** → http://localhost:5173
- **Admin Panel** → http://localhost:5173/admin
- **Stream Dashboard** → http://localhost:5173/stream (open in OBS)

---

## Admin Workflow

1. **Settings tab** — Name your regions (e.g. Shire, Rohan, Gondor, Mordor) and set the year
2. **Teams tab** — Add all 64 characters. Upload a photo for each. Assign to a region + seed number
3. **Bracket Setup tab** — Click "Initialize Bracket" to create 63 matchup slots, then seed each Round 1 game
4. **Matchups tab** — Open individual matchups for voting (click "Open Voting"), declare winners when done
5. **Dashboard tab** — Pick which matchups appear on the stream view and in what order

---

## Stream Dashboard

Open `http://localhost:5173/stream` in a browser window for OBS.

- **OBS Browser Source**: set to 1920×1080
- The stream page auto-scales to fit your window
- **Navigate**: use ← → arrow keys (requires admin login on the stream page)
- Vote counts refresh every 4 seconds automatically
- Log in with admin password directly on the stream page for keyboard control

---

## Voting (Public)

- `http://localhost:5173` — Full bracket view
- Click any active matchup to vote
- Click the team's photo/side to cast your vote
- Votes are tied to a browser fingerprint (localStorage UUID) — one vote per browser per matchup
- Vote tallies appear immediately after voting

---

## Data Storage

All data is stored as JSON files in `backend/data/`:
- `tournament.json` — teams, matchups, bracket state, settings
- `votes.json` — voter ID records

Team photos are stored in `backend/uploads/`.

---

## File Structure

```
memm/
├── .env                    ← Admin password
├── package.json            ← Root (runs both servers)
├── backend/
│   ├── server.js           ← Express API
│   ├── data/
│   │   ├── tournament.json
│   │   └── votes.json
│   └── uploads/            ← Team photos (created automatically)
└── frontend/
    ├── vite.config.js
    └── src/
        ├── pages/
        │   ├── BracketPage.jsx   ← Public bracket view
        │   ├── VotingPage.jsx    ← Individual matchup voting
        │   ├── AdminPage.jsx     ← Admin panel
        │   └── StreamPage.jsx    ← 1920×1080 stream dashboard
        └── api.js
```

---

## For S3/GitHub Deployment (later)

When ready to deploy:
1. Build the frontend: `cd frontend && npm run build`
2. Upload `frontend/dist/` to S3 as a static site
3. Deploy the backend to a VPS/Lambda/Railway etc.
4. Update `vite.config.js` proxy to point to the live backend URL
