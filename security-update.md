# MEMM Security Update

## Critical: Admin Authentication is Broken

### The Problem

The login endpoint (`server.js:195`) returns the raw admin password as the "token":

```js
res.json({ success: true, token: ADMIN_PASSWORD });
```

The auth middleware (`server.js:102-106`) compares the header directly to the password:

```js
const token = req.headers['x-admin-token'];
if (token !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorized' });
```

This means:

1. The admin "token" **is** the plaintext password
2. It's stored in `sessionStorage` in the browser (visible in DevTools)
3. It's sent as a plain header (`x-admin-token`) in every admin request
4. Anyone who intercepts one request has permanent admin access
5. The current password in `.env` is `memm` — trivially guessable

### How to Fix

**Step 1 — Change the password immediately.** Open `.env` and set a strong password:

```
ADMIN_PASSWORD=a-long-random-passphrase-here
```

**Step 2 — Generate real session tokens.** Replace the login endpoint so it returns a random token instead of the password:

```js
const crypto = require('crypto');
const activeSessions = new Map(); // token -> { createdAt }

app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  activeSessions.set(token, { createdAt: Date.now() });
  res.json({ success: true, token });
});
```

**Step 3 — Update the auth middleware to validate against the session store:**

```js
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  const session = activeSessions.get(token);
  if (!session || Date.now() - session.createdAt > SESSION_TTL) {
    activeSessions.delete(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

**Step 4 — No frontend changes needed.** The frontend already stores the token in `sessionStorage` and sends it via the `x-admin-token` header. The only difference is the token value will now be a random hex string instead of the password.

---

## High: Voter ID is Trivially Forgeable

### The Problem

`frontend/src/utils/voter.js` generates a random string stored in `localStorage`:

```js
id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
```

The backend trusts whatever `voterId` string the client sends. Anyone can vote unlimited times by:

- Opening an incognito window
- Running `localStorage.removeItem('memm_voter_id')` in the console
- Sending `curl` requests with arbitrary voter IDs
- Using different browsers

### Recommended Defenses (Layer These)

**1. IP-based rate limiting** — Install `express-rate-limit` and apply it to the vote endpoint:

```bash
npm install express-rate-limit
```

```js
const rateLimit = require('express-rate-limit');

const voteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // max 20 votes per IP per window
  message: { error: 'Too many votes from this IP, try again later' }
});

app.post('/api/matchups/:id/vote', voteLimiter, (req, res) => {
  // existing handler
});
```

**2. Server-generated voter tokens** — Instead of trusting client-generated IDs, issue an httpOnly cookie on first visit:

```js
app.get('/api/voter-token', (req, res) => {
  if (!req.cookies.memm_voter) {
    const token = crypto.randomBytes(16).toString('hex');
    res.cookie('memm_voter', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
    });
  }
  res.json({ ok: true });
});
```

Then use the cookie value as the voter ID on the server side instead of accepting it from the request body.

**3. Browser fingerprinting** — Replace the random ID with a real fingerprinting library like [FingerprintJS](https://github.com/nicefingertip/fingerprintjs) for a more durable browser identifier.

**4. CAPTCHA** — Add a CAPTCHA (e.g., hCaptcha, Cloudflare Turnstile) to the vote submission for suspicious traffic patterns.

---

## Medium: No Input Sanitization on Admin Settings

### The Problem

`PUT /admin/settings` at `server.js:200-204` spreads `req.body` directly:

```js
data.settings = { ...data.settings, ...req.body };
```

An attacker with the admin token can inject arbitrary keys into the settings object.

### Fix

Allowlist the fields explicitly:

```js
app.put('/api/admin/settings', adminAuth, (req, res) => {
  const data = getData();
  const { name, year, status } = req.body;
  if (name !== undefined) data.settings.name = name;
  if (year !== undefined) data.settings.year = year;
  if (status !== undefined) data.settings.status = status;
  saveData(data);
  res.json(data.settings);
});
```

---

## Medium: File Upload Validation is Missing

### The Problem

Multer (`server.js:47-51`) only checks file size. There is no file type validation. The upload directory is served with `express.static`, so an uploaded `.html` or `.svg` file would be served with its original content type, enabling stored XSS.

### Fix

Add a file filter to multer:

```js
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
    }
  }
});
```

---

## Medium: CORS Not Configured for Production

### The Problem

`server.js:55` locks CORS to localhost origins. When deployed, either:

- The production domain needs to be added, or
- CORS gets opened to `*` by accident, allowing any site to submit votes

### Fix

Use an environment variable:

```js
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4173'];

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
```

Then in `.env`:

```
CORS_ORIGINS=https://yourdomain.com,http://localhost:5173
```

---

## Low: No Rate Limiting on Any Endpoint

Without `express-rate-limit`, a script could brute-force the admin password (currently 4 characters: `memm`) or flood votes with randomized voter IDs.

Apply rate limiting globally and with stricter limits on the login endpoint:

```js
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts' }
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  // existing handler
});
```

---

## Low: Race Condition on Vote Writes

`getData()` and `saveData()` use synchronous file I/O with no locking. Two concurrent votes can read the same count, both increment by 1, and both write — losing one vote.

For the current scale this is unlikely to cause major issues, but under heavy load it will. Options:

- Use a lightweight embedded database (SQLite with WAL mode)
- Add a simple file lock (e.g., `proper-lockfile` npm package)
- Queue writes through an in-memory buffer that flushes periodically

---

## Checklist

- [ ] Change admin password in `.env` to something strong
- [ ] Implement real session tokens for admin auth
- [ ] Add rate limiting (`express-rate-limit`) to login and vote endpoints
- [ ] Add file type validation to multer upload
- [ ] Allowlist fields in settings update endpoint
- [ ] Configure CORS for production domain
- [ ] Consider server-side voter tokens (httpOnly cookies)
- [ ] Verify `.env` is in `.gitignore`
