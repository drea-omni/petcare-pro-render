# 🐾 PetCare Pro — Render Deployment

Omni embedded analytics demo app for a veterinary multi-tenant scenario.
Single-service deployment: Express serves the built React frontend + handles API.

---

## 🚀 Deploy to Render (5 steps)

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "Initial PetCare Pro deploy"
git remote add origin https://github.com/YOUR_USERNAME/petcare-pro.git
git push -u origin main
```

### 2. Add your logo
Copy your logo file to:
```
frontend/public/petcarepro_logo.png
```

### 3. Connect Render
1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Render will auto-detect `render.yaml` — confirm the settings

### 4. Set Environment Variables
In Render dashboard → Environment, add:

| Key | Value |
|-----|-------|
| `OMNI_EMBED_SECRET` | Your Omni embed signing secret |
| `OMNI_ORG_URL` | e.g. `https://your-org.omniapp.co` |
| `OMNI_CONNECTION_ID` | Your Omni connection ID |
| `OMNI_DASHBOARD_PATH` | e.g. `/dashboards/abc123def456` |
| `MOTHERDUCK_TOKEN` | Your MotherDuck token |

### 5. Deploy
Click **Deploy** — Render will:
- Run `npm install` (backend deps)
- Run `cd frontend && npm install && npm run build` (React build)
- Start `node backend/server.js` (serves everything on port 10000)

---

## 🏗️ Local Development

```bash
# Install backend deps
npm install

# Install frontend deps + run dev server
cd frontend && npm install && npm run dev

# In a separate terminal — start backend
cp backend/.env.example backend/.env
# Fill in your .env values, then:
node backend/server.js
```

Frontend: http://localhost:5173 (proxies /api → backend)
Backend: http://localhost:3001

---

## 🗂️ Structure

```
petcare-pro/
├── render.yaml              # Render config
├── package.json             # Backend deps + build script
├── .gitignore
├── backend/
│   ├── server.js            # Express + Omni signing + MotherDuck
│   └── .env.example
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── styles.css
```

---

## 🔧 Customization Notes

### Clinic Theme Map
In `backend/server.js`, update `CLINIC_THEMES` with your actual `clinic_id` values
from MotherDuck and desired brand colors:
```js
const CLINIC_THEMES = {
  '1': { accent: '#e37803', background: '#FFF8F0' },
  // ... add your clinic IDs
};
```

### MotherDuck Table Names
In `backend/server.js` `/api/clinics` route, update the SQL to match your schema:
```sql
SELECT clinic_id::VARCHAR AS clinic_id, clinic_name
FROM clinics         -- ← update if your table name differs
ORDER BY clinic_name
```

### Omni Base Connection Role
⚠️ **Important:** In your Omni workspace settings, set the connection's base
access role to **VIEWER** — the `connectionRoles` embed parameter cannot
downgrade below the base role.

### Omni Theming (Optional)
To pass theme colors to the Omni iframe, uncomment the theme param in `server.js`:
```js
params.theme = isDark ? 'dark' : 'vibes';
```
Check Omni docs for supported named themes and custom color overrides.

---

## 📡 Omni Events

The app listens for `omni:*` postMessage events from the iframe and logs them
in the sidebar panel — great for teaching how event handling works!

---

Built with ❤️ by Omni Analytics × Drea
