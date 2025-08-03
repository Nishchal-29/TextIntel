require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { Pool } = require("pg");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());
app.use(cors());

// === CONFIG / CONSTANTS ===
const ACCESS_TOKEN_EXP = "15m"; // short-lived
const REFRESH_TOKEN_EXP_DAYS = 7; // refresh validity
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env");
  process.exit(1);
}

// === DATABASE ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// === EMAIL (password reset) ===
// NOTE: Replace with real SMTP details or use a service like SendGrid / Ethereal for dev.
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.example.com",
  port: parseInt(process.env.EMAIL_PORT || "587", 10),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// === UTILITIES ===
function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXP }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

async function logAudit({ user_id = null, username = null, action, metadata = {}, success, ip }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, username, action, metadata, success, ip) VALUES ($1,$2,$3,$4,$5,$6)`,
      [user_id, username, action, metadata, success, ip]
    );
  } catch (e) {
    console.warn("Audit log failed:", e.message);
  }
}

// === MIDDLEWARE ===
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    await logAudit({ username: null, action: "authenticate_missing_header", success: false, ip: req.ip });
    return res.status(401).json({ error: "Missing Authorization header" });
  }
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    await logAudit({ username: null, action: "authenticate_malformed", success: false, ip: req.ip });
    return res.status(401).json({ error: "Malformed token" });
  }
  const token = parts[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { sub, username, role, iat, exp }
    next();
  } catch (e) {
    await logAudit({ username: null, action: "authenticate_invalid", success: false, ip: req.ip });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!allowedRoles.includes(req.user.role)) {
      logAudit({
        user_id: req.user.sub,
        username: req.user.username,
        action: "authorize_forbidden",
        metadata: { attempted: req.user.role, allowed: allowedRoles },
        success: false,
        ip: req.ip,
      });
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    next();
  };
}

// === RATE LIMITERS ===
const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logAudit({ username: req.body?.username || null, action: "login_rate_limited", success: false, ip: req.ip });
    res.status(429).json({ error: "Too many login attempts, try again later." });
  },
});

// === ROUTES ===

// Health
app.get("/health", (req, res) => res.send("OK"));

// Register (can be restricted later)
app.post("/api/auth/register", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role)
    return res.status(400).json({ error: "username,password,role required" });
  const normalizedRole = role.toLowerCase();
  if (!["user", "commander", "admin"].includes(normalizedRole))
    return res.status(400).json({ error: "Invalid role" });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id, username, role`,
      [username, passwordHash, normalizedRole]
    );
    const user = result.rows[0];
    await logAudit({
      user_id: user.id,
      username: user.username,
      action: "register",
      success: true,
      ip: req.ip,
    });
    res.status(201).json({ user });
  } catch (err) {
    if (err.code === "23505") {
      await logAudit({ username, action: "register_duplicate", success: false, ip: req.ip });
      return res.status(409).json({ error: "Username already exists" });
    }
    console.error(err);
    await logAudit({ username, action: "register_error", success: false, ip: req.ip });
    res.status(500).json({ error: "Server error" });
  }
});

// Login (with access + refresh token issuance)
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { username, password, roleRequested } = req.body;
  if (!username || !password || !roleRequested)
    return res.status(400).json({ error: "username,password,roleRequested required" });

  try {
    const userRes = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = userRes.rows[0];
    if (!user) {
      await logAudit({ username, action: "login_failed_no_user", success: false, ip: req.ip });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.role !== roleRequested.toLowerCase()) {
      await logAudit({
        user_id: user.id,
        username: user.username,
        action: "login_failed_role_mismatch",
        metadata: { expected: user.role, requested: roleRequested },
        success: false,
        ip: req.ip,
      });
      return res.status(403).json({ error: "Role mismatch" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit({ user_id: user.id, username: user.username, action: "login_failed_bad_password", success: false, ip: req.ip });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [refreshToken, user.id, expiresAt.toISOString()]
    );

    await logAudit({
      user_id: user.id,
      username: user.username,
      action: "login_success",
      success: true,
      ip: req.ip,
    });

    res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error(err);
    await logAudit({ username: req.body.username, action: "login_error", success: false, ip: req.ip });
    res.status(500).json({ error: "Server error" });
  }
});

// Refresh access token
app.post("/api/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

  try {
    const rtRow = await pool.query(`SELECT * FROM refresh_tokens WHERE token = $1`, [refreshToken]);
    const stored = rtRow.rows[0];
    if (!stored || stored.revoked) {
      await logAudit({ action: "refresh_invalid", success: false, ip: req.ip });
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    if (new Date(stored.expires_at) < new Date()) {
      await logAudit({ action: "refresh_expired", success: false, ip: req.ip });
      return res.status(401).json({ error: "Expired refresh token" });
    }

    const userRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [stored.user_id]);
    const user = userRes.rows[0];
    if (!user) {
      await logAudit({ action: "refresh_user_not_found", success: false, ip: req.ip });
      return res.status(401).json({ error: "User not found" });
    }

    // Revoke old refresh token and issue new (rotation)
    await pool.query(`UPDATE refresh_tokens SET revoked = true WHERE token = $1`, [refreshToken]);
    const newRefreshToken = generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_EXP_DAYS * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      [newRefreshToken, user.id, newExpiresAt.toISOString()]
    );

    const newAccessToken = generateAccessToken(user);
    await logAudit({
      user_id: user.id,
      username: user.username,
      action: "refresh_success",
      success: true,
      ip: req.ip,
    });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout (revoke refresh token)
app.post("/api/auth/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });
  try {
    await pool.query(`UPDATE refresh_tokens SET revoked = true WHERE token = $1`, [refreshToken]);
    await logAudit({ action: "logout", success: true, ip: req.ip });
    res.json({ msg: "Logged out" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Request password reset
app.post("/api/auth/request-password-reset", async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  try {
    const userRes = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = userRes.rows[0];
    // Always respond success to avoid enumeration
    if (!user) {
      await logAudit({ username, action: "password_reset_request_unknown", success: true, ip: req.ip });
      return res.json({ msg: "If user exists, reset link sent" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, resetToken, expiresAt.toISOString()]
    );

    const resetLink = `${process.env.FRONTEND_BASE_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

    await transporter.sendMail({
      from: `"Defense Portal" <no-reply@defense.local>`,
      to: user.username, // assuming username is email
      subject: "Password Reset",
      text: `Reset your password: ${resetLink}`,
      html: `<p>Reset your password: <a href="${resetLink}">${resetLink}</a></p>`,
    });

    await logAudit({ user_id: user.id, username: user.username, action: "password_reset_requested", success: true, ip: req.ip });
    res.json({ msg: "If user exists, reset link sent" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// Perform password reset
app.post("/api/auth/reset-password", async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: "token and newPassword required" });

  try {
    const row = await pool.query(`SELECT * FROM password_resets WHERE token = $1`, [token]);
    const pr = row.rows[0];
    if (!pr || pr.used || new Date(pr.expires_at) < new Date()) {
      await logAudit({ action: "password_reset_invalid", success: false, ip: req.ip });
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, pr.user_id]);
    await pool.query(`UPDATE password_resets SET used = true WHERE id = $1`, [pr.id]);

    await logAudit({ user_id: pr.user_id, action: "password_reset_completed", success: true, ip: req.ip });
    res.json({ msg: "Password reset successful" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// === PROTECTED SAMPLES ===
// Add audit wrapper for protected
app.use("/api/protected", authenticate, async (req, res, next) => {
  await logAudit({
    user_id: req.user.sub,
    username: req.user.username,
    action: "access_protected_base",
    metadata: { path: req.path },
    success: true,
    ip: req.ip,
  });
  next();
});

app.get("/api/protected/user", authorize(["user", "commander", "admin"]), (req, res) => {
  res.json({ msg: "Hello user-level", user: req.user });
});

app.get("/api/protected/commander", authorize(["commander", "admin"]), (req, res) => {
  res.json({ msg: "Hello commander-level", user: req.user });
});

app.get("/api/protected/admin", authorize(["admin"]), (req, res) => {
  res.json({ msg: "Hello admin-level", user: req.user });
});

// === SERVER START ===
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Auth service running on port ${PORT}`);
});
