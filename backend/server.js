require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const duckdb = require('duckdb');
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const duckdb = require('duckdb');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Static Files (Production) ───────────────────────────────────────────────
if (IS_PROD) {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
}

// ─── Per-Tenant Theme Map (keyed by clinic_id) ───────────────────────────────
// Update clinic_id keys to match your actual MotherDuck data
const CLINIC_THEMES = {
  '1': { accent: '#e37803', background: '#FFF8F0' }, // Sunrise Orange
  '2': { accent: '#2563eb', background: '#EFF6FF' }, // Trust Blue
  '3': { accent: '#16a34a', background: '#F0FFF4' }, // Nature Green
  '4': { accent: '#9333ea', background: '#FDF4FF' }, // Purple Paws
  '5': { accent: '#dc2626', background: '#FFF5F5' }, // Cardinal Red
  '6': { accent: '#0891b2', background: '#ECFEFF' }, // Ocean Teal
  '7': { accent: '#b45309', background: '#FFFBEB' }, // Warm Amber
  '8': { accent: '#be185d', background: '#FDF2F8' }, // Rose Gold
};

const DEFAULT_THEME = { accent: '#e37803', background: '#FAFAFA' };

// ─── MotherDuck Connection ───────────────────────────────────────────────────
let db;
let dbConnection;

function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const token = process.env.MOTHERDUCK_TOKEN;
      if (!token) {
        console.warn('⚠️  No MOTHERDUCK_TOKEN found — clinic list will be empty');
        resolve(null);
        return;
      }

      // Connect to MotherDuck
      // Update 'petcare_pro' to match your actual MotherDuck database name
      db = new duckdb.Database(`md:petcare_pro?motherduck_token=${token}`);
      dbConnection = db.connect();
      console.log('✅ MotherDuck connected');
      resolve(dbConnection);
    } catch (err) {
      console.error('❌ MotherDuck connection failed:', err.message);
      resolve(null); // Don't crash server — fall back to mock data
    }
  });
}

// ─── Omni Signed URL Generator ───────────────────────────────────────────────
function generateSignedUrl({ clinicId, clinicName, permission, mode, isDark }) {
  const embedSecret = process.env.OMNI_EMBED_SECRET;
  const orgUrl = process.env.OMNI_ORG_URL;
  const connectionId = process.env.OMNI_CONNECTION_ID;
  const dashboardPath = process.env.OMNI_DASHBOARD_PATH;

  if (!embedSecret || !orgUrl || !connectionId) {
    throw new Error('Missing required Omni env vars (OMNI_EMBED_SECRET, OMNI_ORG_URL, OMNI_CONNECTION_ID)');
  }

  // Content path: APPLICATION → /shared root, SINGLE_CONTENT → specific dashboard
  const contentPath = mode === 'APPLICATION' ? '/shared' : (dashboardPath || '/dashboards/missing');

  const nonce = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // ⚠️  Omni base connection role must be set to VIEWER in workspace settings
  // for connectionRoles override to work correctly
  const connectionRoles = JSON.stringify({ [connectionId]: 'VIEWER' });
  const userAttributes = JSON.stringify({ clinic_id: clinicId.toString() });

  // Build signed params
  const params = {
    connectionRoles,
    contentPath,
    entity: clinicName,
    externalId: `clinic_${clinicId}`,
    name: clinicName,
    nonce,
    timestamp,
    userAttributes,
  };

  // entityFolderContentRole required for APPLICATION mode query access
  if (mode === 'APPLICATION') {
    params.entityFolderContentRole = permission === 'RESTRICTED_QUERIER' ? 'EDITOR' : 'VIEWER';
  }

  // Optional: named Omni theme ('vibes' for light, 'dark' for dark)
  // Uncomment if you want theme passed to Omni:
  // params.theme = isDark ? 'dark' : 'vibes';

  // Sign: sort keys → join as key=value\n → HMAC SHA256 hex
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys.map(k => `${k}=${params[k]}`).join('\n');

  const signature = crypto
    .createHmac('sha256', embedSecret)
    .update(stringToSign)
    .digest('hex');

  // Build final URL
  const queryString = sortedKeys
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');

  const embedUrl = `${orgUrl}/embed${contentPath}?${queryString}&signature=${signature}`;

  return embedUrl;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/clinics — fetch clinic list from MotherDuck
app.get('/api/clinics', async (req, res) => {
  // If no DB connection, return mock clinics for development
  if (!dbConnection) {
    return res.json([
      { clinic_id: '1', clinic_name: 'Pawsome Animal Clinic' },
      { clinic_id: '2', clinic_name: 'Happy Tails Veterinary' },
      { clinic_id: '3', clinic_name: 'Green Meadow Animal Hospital' },
      { clinic_id: '4', clinic_name: 'Urban Paws Clinic' },
      { clinic_id: '5', clinic_name: 'Sunshine Vet Center' },
    ]);
  }

  // Update table/column names to match your MotherDuck schema
  const sql = `
    SELECT clinic_id::VARCHAR AS clinic_id, clinic_name
    FROM clinics
    ORDER BY clinic_name
  `;

  dbConnection.all(sql, (err, rows) => {
    if (err) {
      console.error('MotherDuck query error:', err);
      return res.status(500).json({ error: 'Failed to fetch clinics', detail: err.message });
    }
    res.json(rows);
  });
});

// POST /api/embed-url — generate signed Omni embed URL
app.post('/api/embed-url', (req, res) => {
  const { clinicId, clinicName, permission, mode, isDark } = req.body;

  if (!clinicId || !clinicName) {
    return res.status(400).json({ error: 'clinicId and clinicName are required' });
  }

  try {
    const embedUrl = generateSignedUrl({ clinicId, clinicName, permission, mode, isDark });
    const theme = CLINIC_THEMES[clinicId.toString()] || DEFAULT_THEME;

    res.json({ embedUrl, theme });
  } catch (err) {
    console.error('URL signing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

// Catch-all: serve React app for all non-API routes (production)
if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🐾 PetCare Pro running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  });
}

start();
const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Static Files (Production) ───────────────────────────────────────────────
if (IS_PROD) {
  const distPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
}

// ─── Per-Tenant Theme Map (keyed by clinic_id) ───────────────────────────────
// Update clinic_id keys to match your actual MotherDuck data
const CLINIC_THEMES = {
  '1': { accent: '#e37803', background: '#FFF8F0' }, // Sunrise Orange
  '2': { accent: '#2563eb', background: '#EFF6FF' }, // Trust Blue
  '3': { accent: '#16a34a', background: '#F0FFF4' }, // Nature Green
  '4': { accent: '#9333ea', background: '#FDF4FF' }, // Purple Paws
  '5': { accent: '#dc2626', background: '#FFF5F5' }, // Cardinal Red
  '6': { accent: '#0891b2', background: '#ECFEFF' }, // Ocean Teal
  '7': { accent: '#b45309', background: '#FFFBEB' }, // Warm Amber
  '8': { accent: '#be185d', background: '#FDF2F8' }, // Rose Gold
};

const DEFAULT_THEME = { accent: '#e37803', background: '#FAFAFA' };

// ─── MotherDuck Connection ───────────────────────────────────────────────────
let db;
let dbConnection;

function initDatabase() {
  return new Promise((resolve, reject) => {
    try {
      const token = process.env.MOTHERDUCK_TOKEN;
      if (!token) {
        console.warn('⚠️  No MOTHERDUCK_TOKEN found — clinic list will be empty');
        resolve(null);
        return;
      }

      // Connect to MotherDuck
      // Update 'petcare_pro' to match your actual MotherDuck database name
      db = new duckdb.Database(`md:petcare_pro?motherduck_token=${token}`);
      dbConnection = db.connect();
      console.log('✅ MotherDuck connected');
      resolve(dbConnection);
    } catch (err) {
      console.error('❌ MotherDuck connection failed:', err.message);
      resolve(null); // Don't crash server — fall back to mock data
    }
  });
}

// ─── Omni Signed URL Generator ───────────────────────────────────────────────
function generateSignedUrl({ clinicId, clinicName, permission, mode, isDark }) {
  const embedSecret = process.env.OMNI_EMBED_SECRET;
  const orgUrl = process.env.OMNI_ORG_URL;
  const connectionId = process.env.OMNI_CONNECTION_ID;
  const dashboardPath = process.env.OMNI_DASHBOARD_PATH;

  if (!embedSecret || !orgUrl || !connectionId) {
    throw new Error('Missing required Omni env vars (OMNI_EMBED_SECRET, OMNI_ORG_URL, OMNI_CONNECTION_ID)');
  }

  // Content path: APPLICATION → /shared root, SINGLE_CONTENT → specific dashboard
  const contentPath = mode === 'APPLICATION' ? '/shared' : (dashboardPath || '/dashboards/missing');

  const nonce = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // ⚠️  Omni base connection role must be set to VIEWER in workspace settings
  // for connectionRoles override to work correctly
  const connectionRoles = JSON.stringify({ [connectionId]: 'VIEWER' });
  const userAttributes = JSON.stringify({ clinic_id: clinicId.toString() });

  // Build signed params
  const params = {
    connectionRoles,
    contentPath,
    entity: clinicName,
    externalId: `clinic_${clinicId}`,
    name: clinicName,
    nonce,
    timestamp,
    userAttributes,
  };

  // entityFolderContentRole required for APPLICATION mode query access
  if (mode === 'APPLICATION') {
    params.entityFolderContentRole = permission === 'RESTRICTED_QUERIER' ? 'EDITOR' : 'VIEWER';
  }

  // Optional: named Omni theme ('vibes' for light, 'dark' for dark)
  // Uncomment if you want theme passed to Omni:
  // params.theme = isDark ? 'dark' : 'vibes';

  // Sign: sort keys → join as key=value\n → HMAC SHA256 hex
  const sortedKeys = Object.keys(params).sort();
  const stringToSign = sortedKeys.map(k => `${k}=${params[k]}`).join('\n');

  const signature = crypto
    .createHmac('sha256', embedSecret)
    .update(stringToSign)
    .digest('hex');

  // Build final URL
  const queryString = sortedKeys
    .map(k => `${k}=${encodeURIComponent(params[k])}`)
    .join('&');

  const embedUrl = `${orgUrl}/embed${contentPath}?${queryString}&signature=${signature}`;

  return embedUrl;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /api/clinics — fetch clinic list from MotherDuck
app.get('/api/clinics', async (req, res) => {
  // If no DB connection, return mock clinics for development
  if (!dbConnection) {
    return res.json([
      { clinic_id: '1', clinic_name: 'Pawsome Animal Clinic' },
      { clinic_id: '2', clinic_name: 'Happy Tails Veterinary' },
      { clinic_id: '3', clinic_name: 'Green Meadow Animal Hospital' },
      { clinic_id: '4', clinic_name: 'Urban Paws Clinic' },
      { clinic_id: '5', clinic_name: 'Sunshine Vet Center' },
    ]);
  }

  // Update table/column names to match your MotherDuck schema
  const sql = `
    SELECT clinic_id::VARCHAR AS clinic_id, clinic_name
    FROM clinics
    ORDER BY clinic_name
  `;

  dbConnection.all(sql, (err, rows) => {
    if (err) {
      console.error('MotherDuck query error:', err);
      return res.status(500).json({ error: 'Failed to fetch clinics', detail: err.message });
    }
    res.json(rows);
  });
});

// POST /api/embed-url — generate signed Omni embed URL
app.post('/api/embed-url', (req, res) => {
  const { clinicId, clinicName, permission, mode, isDark } = req.body;

  if (!clinicId || !clinicName) {
    return res.status(400).json({ error: 'clinicId and clinicName are required' });
  }

  try {
    const embedUrl = generateSignedUrl({ clinicId, clinicName, permission, mode, isDark });
    const theme = CLINIC_THEMES[clinicId.toString()] || DEFAULT_THEME;

    res.json({ embedUrl, theme });
  } catch (err) {
    console.error('URL signing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV });
});

// Catch-all: serve React app for all non-API routes (production)
if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
  });
}

// ─── Start Server ─────────────────────────────────────────────────────────────
async function start() {
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`🐾 PetCare Pro running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  });
}

start();
