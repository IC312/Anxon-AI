require('dotenv').config();
const express   = require('express');
const mongoose  = require('mongoose');
const cors      = require('cors');
const path      = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ──────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅  MongoDB connected'))
  .catch(err => { console.error('❌  MongoDB error:', err.message); process.exit(1); });

// ── API Routes ────────────────────────────────────────
app.use('/api/auth',  require('./routes/auth'));
app.use('/api/chat',  require('./routes/chat'));
app.use('/api/admin', require('./routes/admin'));

// ── Hidden admin login page (/admin) ──────────────────
app.get('/admin', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
);

// ── Student login fallback ────────────────────────────
app.get('*', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀  Server running → http://localhost:${PORT}`));
