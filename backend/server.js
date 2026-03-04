import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import duckdb from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

if (IS_PROD) {
  const distPath = join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
}

// ── Map UI selection → valid Omni connectionRoles value ──────────────────────
const CONNECTION_ROLE_MAP = {
  'VIEWER': 'VIEWER',
  'RESTRICTED_QUERIER': 'QUERIER'
};

// MotherDuck connection
const db = new duckdb.Database(':memory:');
const connection = db.connect();

connection.exec(`
  INSTALL motherduck;
  LOAD motherduck;
  SET motherduck_token='${process.env.MOTHERDUCK_TOKEN}';
  ATTACH 'md:petcare_pro_db';
`, (err) => {
  if (err) {
    console.error('❌ MotherDuck connection error:', err);
  } else {
    console.log('✅ MotherDuck connected successfully!');
  }
});

async function getClinicList() {
  return new Promise((resolve, reject) => {
    connection.all(
      `SELECT email, clinic_name, clinic_id 
       FROM petcare_pro_db.marts.dim_clinics 
       ORDER BY clinic_name`,
      (err, result) => {
        if (err) { reject(err); }
        else { resolve(result); }
      }
    );
  });
}

async function getClinicByEmail(email) {
  return new Promise((resolve, reject) => {
    connection.all(
      `SELECT clinic_id, clinic_name 
       FROM petcare_pro_db.marts.dim_clinics 
       WHERE email = ?`,
      [email],
      (err, result) => {
        if (err) { reject(err); }
        else { resolve(result[0] || null); }
      }
    );
  });
}

function generateOmniSignedUrl(userEmail, connectionRole, mode, dashboardPath, clinicId, clinicName) {
  const baseUrl = process.env.OMNI_BASE_URL;
  const secret = process.env.OMNI_EMBED_SECRET;
  const connectionId = process.env.OMNI_CONNECTION_ID;

  // 🔍 DEBUG — remove after testing
  console.log('=== DEBUG ENV ===');
  console.log('BASE_URL:', baseUrl);
  console.log('CONNECTION_ID:', connectionId);
  console.log('SECRET length:', secret?.length);
  console.log('SECRET first 4:', secret?.substring(0, 4));
  console.log('SECRET last 4:', secret?.slice(-4));
  console.log('SECRET has newline?', secret?.includes('\n'));
  console.log('SECRET has space?', secret?.includes(' '));
  console.log('=================');

  const loginUrl = `${baseUrl}/embed/login`;
  const nonce = crypto.randomBytes(24).toString('base64url').slice(0, 32);
  const externalId = userEmail;
  const name = userEmail.split('@')[0];
  const embedPath = mode === 'APPLICATION' ? '/shared' : dashboardPath;

  const omniConnectionRole = CONNECTION_ROLE_MAP[connectionRole] || 'VIEWER';
  const connectionRoles = JSON.stringify({ [connectionId]: omniConnectionRole });

  const embedMode = mode;
  const entity = clinicName;
  const entityFolderContentRole = connectionRole === 'RESTRICTED_QUERIER' ? 'EDITOR' : 'VIEWER';
  const userAttributes = JSON.stringify({ clinic_id: clinicId });

  const signingString = [
    loginUrl, embedPath, externalId, name, nonce,
    connectionRoles, entity, entityFolderContentRole, embedMode, userAttributes
  ].join('\n').trimEnd();

  console.log('Signing string:\n' + signingString);
  console.log('Signing string length:', signingString.length);

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signingString);
  const signature = hmac.digest('base64url');

  const params = new URLSearchParams({
    contentPath: embedPath,
    externalId,
    name,
    nonce,
    connectionRoles,
    entity,
    entityFolderContentRole,
    mode: embedMode,
    userAttributes,
    signature
  });

  const finalUrl = `${loginUrl}?${params.toString()}`;

  console.log('UI Role:', connectionRole, '→ Omni Role:', omniConnectionRole);
  console.log('entityFolderContentRole:', entityFolderContentRole);
  console.log('Full URL:', finalUrl);

  return finalUrl;
}

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/api/clinics', async (req, res) => {
  try {
    const clinics = await getClinicList();
    res.json({ success: true, clinics });
  } catch (error) {
    console.error('Error fetching clinics:', error);
    res.status(500).json({ error: 'Server error', message: 'Failed to fetch clinic list.' });
  }
});

app.post('/api/embed-url', async (req, res) => {
  try {
    const { email, connectionRole, mode } = req.body;

    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!connectionRole || !['VIEWER', 'RESTRICTED_QUERIER'].includes(connectionRole)) {
      return res.status(400).json({ error: 'Valid connectionRole required' });
    }
    if (!mode || !['SINGLE_CONTENT', 'APPLICATION'].includes(mode)) {
      return res.status(400).json({ error: 'Valid mode required' });
    }

    const clinic = await getClinicByEmail(email.toLowerCase().trim());
    if (!clinic) {
      return res.status(404).json({ error: 'Clinic not found', message: 'No clinic associated with this email.' });
    }

    const embedUrl = generateOmniSignedUrl(
      email, connectionRole, mode,
      process.env.OMNI_DASHBOARD_PATH,
      clinic.clinic_id, clinic.clinic_name
    );

    res.json({ 
      success: true, 
      embedUrl, 
      user: { email, connectionRole, mode, clinicId: clinic.clinic_id, clinicName: clinic.clinic_name } 
    });

  } catch (error) {
    console.error('Error generating embed URL:', error);
    res.status(500).json({ error: 'Server error', message: 'Failed to generate embed URL.' });
  }
});

if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../frontend/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`\n🚀 PetCare Pro running on port ${PORT} [${IS_PROD ? 'production' : 'development'}]`);
  console.log(`🔗 Health: http://localhost:${PORT}/health\n`);
});
