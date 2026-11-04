const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

function createDiscordClient(config) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
  });

  async function registerCommands() {
    const commands = [
      new SlashCommandBuilder()
        .setName("greymarch")
        .setDescription("Administer the Greymarch sorting event")
        .addSubcommand(s => s.setName("status").setDescription("View Greymarch status"))
        .addSubcommand(s => s.setName("start").setDescription("Open a new sorting era (role clearing is not yet enabled)"))
        .addSubcommand(s => s.setName("end").setDescription("Close the Greymarch and lock new sorting"))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
    ];

    const rest = new REST({ version: "10" }).setToken(config.botToken);
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });
  }

  return { client, registerCommands };
}

module.exports = { createDiscordClient };
