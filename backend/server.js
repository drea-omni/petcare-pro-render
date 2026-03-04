import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import duckdb from 'duckdb';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());

// ── Serve React build in production ──────────────────────────────────────────
if (IS_PROD) {
  const distPath = join(__dirname, '../frontend/dist');
  app.use(express.static(distPath));
}

// MotherDuck connection (for clinic list only)
const db = new duckdb.Database(':memory:');
const connection = db.connect();

// Initialize MotherDuck connection
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

// Helper: Get list of clinics for dropdown
async function getClinicList() {
  return new Promise((resolve, reject) => {
    connection.all(
      `SELECT email, clinic_name, clinic_id 
       FROM petcare_pro_db.marts.dim_clinics 
       ORDER BY clinic_name`,
      (err, result) => {
        if (err) {
          console.error('MotherDuck query error:', err);
          reject(err);
        } else {
          resolve(result);
        }
      }
    );
  });
}

// Helper: Get clinic_id and clinic_name from email
async function getClinicByEmail(email) {
  return new Promise((resolve, reject) => {
    connection.all(
      `SELECT clinic_id, clinic_name 
       FROM petcare_pro_db.marts.dim_clinics 
       WHERE email = ?`,
      [email],
      (err, result) => {
        if (err) {
          console.error('MotherDuck query error:', err);
          reject(err);
        } else {
          resolve(result[0] || null);
        }
      }
    );
  });
}

// Helper: Generate Omni signed embed URL
function generateOmniSignedUrl(userEmail, connectionRole, mode, dashboardPath, clinicId, clinicName) {

  // Base URL and secret from environment
  const baseUrl = process.env.OMNI_BASE_URL;
  const secret = process.env.OMNI_EMBED_SECRET;
  const connectionId = process.env.OMNI_CONNECTION_ID;

  // Login URL
  const loginUrl = `${baseUrl}/embed/login`;

  // Generate exactly 32 character nonce
  const nonce = crypto.randomBytes(24).toString('base64url').slice(0, 32);

  // User identity
  const externalId = userEmail;
  const name = userEmail.split('@')[0];

  // Content path - depends on mode
  const embedPath = mode === 'APPLICATION' ? '/shared' : dashboardPath;

  // Connection roles
  const connectionRoles = JSON.stringify({
    [connectionId]: connectionRole
  });

  // Embed mode
  const embedMode = mode;

  // Entity - for multi-tenant isolation and entity groups
  const entity = clinicName;

  // Entity folder content role
  const entityFolderContentRole = connectionRole === 'RESTRICTED_QUERIER' ? 'EDITOR' : 'VIEWER';

  // User attributes - CRITICAL for row-level security!
  const userAttributes = JSON.stringify({ 
    clinic_id: clinicId 
  });

  // Signing string - exact alphabetical order per Omni docs
  const signingString = [
    loginUrl,
    embedPath,
    externalId,
    name,
    nonce,
    connectionRoles,
    entity,
    entityFolderContentRole,
    embedMode,
    userAttributes
  ].join('\n');

  console.log('\nSigning string:\n', signingString);

  // Sign with HMAC SHA256 base64url
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(signingString);
  const signature = hmac.digest('base64url');

  // Build final URL params
  const params = new URLSearchParams({
    contentPath: embedPath,
    externalId: externalId,
    name: name,
    nonce: nonce,
    connectionRoles: connectionRoles,
    entity: entity,
    entityFolderContentRole: entityFolderContentRole,
    mode: embedMode,
    userAttributes: userAttributes,
    signature: signature
  });

  const finalUrl = `${loginUrl}?${params.toString()}`;

  console.log('\n✅ Generated embed URL for:', userEmail);
  console.log('Clinic:', clinicName, '| Clinic ID:', clinicId, '| Role:', connectionRole, '| Mode:', mode);
  console.log('Full URL:', finalUrl, '\n');

  return finalUrl;
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    message: 'PetCare Embed Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Get clinic list for dropdown
app.get('/api/clinics', async (req, res) => {
  try {
    const clinics = await getClinicList();
    res.json({
      success: true,
      clinics: clinics
    });
  } catch (error) {
    console.error('Error fetching clinics:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to fetch clinic list. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Main endpoint: Generate embed URL
app.post('/api/embed-url', async (req, res) => {
  try {
    const { email, connectionRole, mode } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    if (!connectionRole || !['VIEWER', 'RESTRICTED_QUERIER'].includes(connectionRole)) {
      return res.status(400).json({
        error: 'Valid connectionRole (VIEWER or RESTRICTED_QUERIER) is required'
      });
    }

    if (!mode || !['SINGLE_CONTENT', 'APPLICATION'].includes(mode)) {
      return res.status(400).json({
        error: 'Valid mode (SINGLE_CONTENT or APPLICATION) is required'
      });
    }

    console.log(`Processing embed request for ${email} with role ${connectionRole} in ${mode} mode`);

    const clinic = await getClinicByEmail(email.toLowerCase().trim());

    if (!clinic) {
      console.log(`Clinic not found for email: ${email}`);
      return res.status(404).json({
        error: 'Clinic not found',
        message: 'No clinic associated with this email address.'
      });
    }

    console.log(`Found clinic: ${clinic.clinic_name} (${clinic.clinic_id}) for ${email}`);

    const embedUrl = generateOmniSignedUrl(
      email,
      connectionRole,
      mode,
      process.env.OMNI_DASHBOARD_PATH,
      clinic.clinic_id,
      clinic.clinic_name
    );

    res.json({
      success: true,
      embedUrl,
      user: {
        email,
        connectionRole,
        mode,
        clinicId: clinic.clinic_id,
        clinicName: clinic.clinic_name
      }
    });

  } catch (error) {
    console.error('Error generating embed URL:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to generate embed URL. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ── Catch-all: serve React app for non-API routes (production only) ───────────
if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, '../frontend/dist/index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 PetCare Pro Launch Cradle running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Mode: ${IS_PROD ? 'Production (serving React build)' : 'Development'}\n`);
});
