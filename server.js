require("dotenv").config();

const crypto = require("node:crypto");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const SQLiteStoreFactory = require("connect-sqlite3");
const { loadConfig } = require("./config");
const { openDatabase } = require("./db");
const { createDiscordClient } = require("./discord");

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

if (config.trustProxy) app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: require("node:path").dirname(config.databasePath) }),
  name: "herald.sid",
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: config.trustProxy,
    sameSite: "none",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", config.frontendOrigin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const { client: discord, registerCommands } = createDiscordClient(config);
const getSetting = db.prepare("SELECT value FROM settings WHERE key = ?");
const setSetting = db.prepare(`
  INSERT INTO settings(key,value) VALUES(?,?)
  ON CONFLICT(key) DO UPDATE SET value=excluded.value
`);
const getAssignment = db.prepare("SELECT * FROM assignments WHERE discord_user_id = ?");
const insertAssignment = db.prepare(`
  INSERT INTO assignments(discord_user_id,username,realm,assigned_at,event)
  VALUES(@discord_user_id,@username,@realm,@assigned_at,@event)
`);
const isGreymarchActive = () => getSetting.get("greymarch_active")?.value === "true";

function requireLogin(req, res, next) {
  if (!req.session.discordUser) return res.status(401).json({ error: "Sign in with Discord first." });
  next();
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function makeState() {
  return crypto.randomBytes(32).toString("hex");
}
async function discordApi(path, options = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${config.botToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

app.get("/health", (_req, res) => res.json({ ok: true, service: "the-madgods-herald" }));
app.get("/api/config", (_req, res) => res.json({ discordLoginEnabled: true }));

app.get("/auth/discord", (req, res) => {
  const state = makeState();
  req.session.oauthState = state;
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

app.get("/auth/discord/callback", async (req, res, next) => {
  try {
    if (!req.query.code || !safeEqual(req.query.state, req.session.oauthState)) {
      return res.status(400).send("Discord sign-in could not be verified. Please return to the ceremony and try again.");
    }
    delete req.session.oauthState;

    const tokenResponse = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: config.redirectUri
      })
    });
    if (!tokenResponse.ok) throw new Error(`Discord token exchange failed: ${await tokenResponse.text()}`);
    const token = await tokenResponse.json();

    const userResponse = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!userResponse.ok) throw new Error("Could not retrieve the Discord user.");
    const user = await userResponse.json();

    // Verify server membership using the bot; OAuth identity alone is not sufficient.
    await discordApi(`/guilds/${config.guildId}/members/${user.id}`);
    req.session.discordUser = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar
    };
    res.redirect(`${config.frontendOrigin}/quiz.html?discord=connected`);
  } catch (error) {
    next(error);
  }
});

app.get("/api/me", requireLogin, (req, res) => {
  const assignment = getAssignment.get(req.session.discordUser.id);
  res.json({
    user: req.session.discordUser,
    assigned: Boolean(assignment),
    realm: assignment?.realm || null,
    greymarchActive: isGreymarchActive()
  });
});

app.post("/api/logout", requireLogin, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Answers are submitted as nine A/B selections. Realm mapping remains exclusively here.
app.post("/api/sort", requireLogin, async (req, res, next) => {
  try {
    const user = req.session.discordUser;
    const existing = getAssignment.get(user.id);
    if (existing && !isGreymarchActive()) {
      return res.status(409).json({ error: "Your realm has already been assigned. The sorting is sealed until the Greymarch." });
    }
    if (isGreymarchActive()) {
      return res.status(503).json({ error: "The Greymarch question set has not yet been configured. Please await the Chamberlain's instructions." });
    }

    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length !== 9 || answers.some(a => a !== 0 && a !== 1)) {
      return res.status(400).json({ error: "Nine valid answers are required." });
    }

    const mania = answers.filter(a => a === 0).length;
    const dementia = answers.filter(a => a === 1).length;
    const realm = mania > dementia ? "mania" : "dementia";
    const roleId = realm === "mania" ? config.maniaRoleId : config.dementiaRoleId;

    const member = await discordApi(`/guilds/${config.guildId}/members/${user.id}`);
    const previousHouse = realm === "mania" ? config.dementiaRoleId : config.maniaRoleId;
    const roles = new Set(member.roles || []);
    roles.delete(previousHouse);
    roles.add(roleId);

    await discordApi(`/guilds/${config.guildId}/members/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ roles: [...roles] })
    });

    const save = db.transaction(() => {
      db.prepare("DELETE FROM assignments WHERE discord_user_id = ?").run(user.id);
      insertAssignment.run({
        discord_user_id: user.id,
        username: user.username,
        realm,
        assigned_at: new Date().toISOString(),
        event: "standard"
      });
    });
    save();

    res.json({
      ok: true,
      realm,
      message: realm === "mania"
        ? "His Grace welcomes you beneath the golden skies of Mania."
        : "The shadows of Dementia have made room for you."
    });
  } catch (error) {
    next(error);
  }
});

// Slash-command interaction handler is registered via discord.js below.
discord.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "greymarch") return;
  if (!interaction.memberPermissions?.has("Administrator")) {
    return interaction.reply({ content: "Only server administrators may issue this decree.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "status") {
    return interaction.reply({
      content: `The Greymarch is currently **${isGreymarchActive() ? "ACTIVE" : "inactive"}**. Existing assignments: ${db.prepare("SELECT COUNT(*) AS n FROM assignments").get().n}.`,
      ephemeral: true
    });
  }
  if (sub === "start") {
    if (isGreymarchActive()) return interaction.reply({ content: "The Greymarch is already active.", ephemeral: true });
    // Safety: do not erase roles/assignments until the dedicated, resumable reset workflow is implemented.
    return interaction.reply({
      content: "The Greymarch reset workflow is not enabled yet. No roles or assignments have been changed. This safeguard prevents an incomplete or accidental realm-wide reset.",
      ephemeral: true
    });
  }
  if (sub === "end") {
    if (!isGreymarchActive()) return interaction.reply({ content: "The Greymarch is not active.", ephemeral: true });
    setSetting.run("greymarch_active", "false");
    db.prepare("UPDATE greymarch_runs SET status='ended', ended_at=? WHERE status='active'").run(new Date().toISOString());
    return interaction.reply({ content: "The Greymarch has been closed. New sorting is sealed.", ephemeral: true });
  }
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "The Chamberlain encountered an unexpected error. Please try again later." });
});

async function start() {
  await discord.login(config.botToken);
  await registerCommands();
  app.listen(config.port, () => console.log(`Herald API listening on port ${config.port}`));
}
start().catch(error => {
  console.error("Startup failed:", error);
  process.exit(1);
});
