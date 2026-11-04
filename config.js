const required = [
  "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI",
  "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "MANIA_ROLE_ID",
  "DEMENTIA_ROLE_ID", "FRONTEND_ORIGIN", "SESSION_SECRET"
];

function loadConfig() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    port: Number(process.env.PORT || 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN.replace(/\/$/, ""),
    redirectUri: process.env.DISCORD_REDIRECT_URI,
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    maniaRoleId: process.env.MANIA_ROLE_ID,
    dementiaRoleId: process.env.DEMENTIA_ROLE_ID,
    sessionSecret: process.env.SESSION_SECRET,
    databasePath: process.env.DATABASE_PATH || "./data/herald.sqlite",
    trustProxy: process.env.TRUST_PROXY === "true"
  };
}

module.exports = { loadConfig };
