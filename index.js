// index.js
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  PermissionsBitField,
  ChannelType,
  SlashCommandBuilder
} from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel]
});

const MIDDLEMAN_ROLE_ID = '1465061909668565038';

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}  |  Middleman + Ticket Bot`);
});

client.on('interactionCreate', async interaction => {
  // ─── /setup ────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Only admins can run /setup', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor('#00ff00')
      .setTitle('Request mm')
      .setDescription(
        `Welcome to **MM Service**!\n\n` +
        `If you are in need of an MM, please read our Middleman rules first and then tap the “Request middleman” button and fill out the form below.\n\n` +
        `• You will be required to vouch your middleman after the trade in the vouches channel. Failing to do so within 24 hours will result in a Blacklist from our MM Service.\n\n` +
        `• Creating any form of troll tickets will also result in a middleman ban.\n\n` +
        `◆ : We are **NOT** responsible for anything that happens after the trade is done. As well as any duped items. By opening a ticket or requesting a middleman you have agreed to our middleman rules.\n\n` +
        `Powered by tickets.bot`
      );

    const btnTicket = new ButtonBuilder()
      .setCustomId('open_regular_ticket')
      .setLabel('Open a ticket!')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📩');

    const btnMM = new ButtonBuilder()
      .setCustomId('open_middleman')
      .setLabel('Request middleman')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🤝');

    const row = new ActionRowBuilder().addComponents(btnTicket, btnMM);

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: 'Panel created!', ephemeral: true });
    return;
  }

  // ─── Regular ticket modal ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'open_regular_ticket') {
    const modal = new ModalBuilder()
      .setCustomId('modal_regular')
      .setTitle('New Support Ticket');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason for ticket')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // ─── Middleman modal ───────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'open_middleman') {
    const modal = new ModalBuilder()
      .setCustomId('modal_middleman')
      .setTitle('Middleman Request');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('other')
          .setLabel('ID/User of the other person')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Discord ID or @mention')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('trade')
          .setLabel('details & value')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('join')
          .setLabel('can both join private server link?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Yes / No')
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // ─── Modal submit handler ──────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });

    const isMM = interaction.customId === 'modal_middleman';
    const prefix = isMM ? 'mm-' : 'ticket-';
    let name = `${prefix}${interaction.user.username}`.slice(0, 90);

    let content = `**Opened by** ${interaction.user}\n\n`;

    if (isMM) {
      const other = interaction.fields.getTextInputValue('other');
      const trade = interaction.fields.getTextInputValue('trade');
      const join = interaction.fields.getTextInputValue('join');
      content += `**Other person:** ${other}\n**Trade details:** ${trade}\n**Can join priv server?** ${join}`;
    } else {
      content += `**Reason:** ${interaction.fields.getTextInputValue('reason')}`;
    }

    const thread = await interaction.channel.threads.create({
      name,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.GuildPrivateThread,
      reason: `${isMM ? 'Middleman' : 'Ticket'} request`,
      invitable: false
    });

    // Add creator
    await thread.members.add(interaction.user.id).catch(() => {});

    // Add all middlemen
    const role = interaction.guild.roles.cache.get(MIDDLEMAN_ROLE_ID);
    if (role) {
      for (const m of role.members.values()) {
        if (!m.user.bot) await thread.members.add(m.id).catch(() => {});
      }
    }

    const embed = new EmbedBuilder()
      .setColor(isMM ? '#ffaa00' : '#00ff9d')
      .setDescription(content)
      .setTimestamp();

    const btnClaim = new ButtonBuilder()
      .setCustomId('btn_claim')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success);

    const btnClose = new ButtonBuilder()
      .setCustomId('btn_close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger);

    await thread.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(btnClaim, btnClose)],
      content: role ? `<@&${MIDDLEMAN_ROLE_ID}>` : undefined
    });

    await interaction.editReply({ content: `→ ${thread}`, ephemeral: true });
  }

  // ─── Claim button ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'btn_claim') {
    if (!interaction.member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
      return interaction.reply({ content: `Only <@&${MIDDLEMAN_ROLE_ID}> can claim tickets.`, ephemeral: true });
    }

    if (interaction.channel.name.includes('claimed-by-')) {
      return interaction.reply({ content: 'Ticket already claimed.', ephemeral: true });
    }

    const newName = `${interaction.channel.name} - claimed-by-${interaction.user.id}`;
    await interaction.channel.setName(newName.slice(0, 100));

    await interaction.reply(`**Claimed by** ${interaction.user}`);
  }

  // ─── Close button ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'btn_close') {
    await interaction.reply('Closing in 8 seconds...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 8000);
  }
});

// ─── $add command ────────────────────────────────────────────────────
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.content.startsWith('$')) return;
  if (!msg.channel.isThread()) return;

  const args = msg.content.slice(1).trim().split(/\s+/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === 'add') {
    if (!msg.member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
      return msg.reply(`Only <@&${MIDDLEMAN_ROLE_ID}> can add users.`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }

    if (!args[0]) return msg.reply('Usage: `$add @user` or `$add 123456789012345678`');

    const targetId = args[0].replace(/[<@!>]*/g, '');
    if (!/^\d{17,20}$/.test(targetId)) return msg.reply('Invalid user.');

    try {
      await msg.channel.members.add(targetId);
      await msg.channel.send(`${msg.author} added <@${targetId}>`);
      await msg.delete().catch(() => {});
    } catch (err) {
      await msg.reply(`Error: ${err.message}`).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
