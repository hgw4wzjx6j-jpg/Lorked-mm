import { Client, GatewayIntentBits, Partials, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ThreadAutoArchiveDuration, PermissionsBitField, ChannelType, SlashCommandBuilder } from 'discord.js';
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

const CONFIG = {
  supportRoleId: process.env.SUPPORT_ROLE_ID || MIDDLEMAN_ROLE_ID,
  logChannelId: process.env.LOG_CHANNEL_ID || null
};

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  // ─── /setup command ────────────────────────────────────────────────
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: 'Only administrators can use /setup.', ephemeral: true });
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

    const ticketBtn = new ButtonBuilder()
      .setCustomId('create_ticket')
      .setLabel('Open a ticket!')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📩');

    const mmBtn = new ButtonBuilder()
      .setCustomId('middleman_request')
      .setLabel('Request middleman')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🤝');

    const row = new ActionRowBuilder().addComponents(ticketBtn, mmBtn);

    await interaction.channel.send({ embeds: [embed], components: [row] });

    await interaction.reply({ content: 'Panel sent!', ephemeral: true });
    return;
  }

  // ─── Create regular ticket modal ───────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'create_ticket') {
    const modal = new ModalBuilder()
      .setCustomId('ticket_modal')
      .setTitle('New Support Ticket');

    const reason = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reason));
    await interaction.showModal(modal);
    return;
  }

  // ─── Middleman request modal ───────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'middleman_request') {
    const modal = new ModalBuilder()
      .setCustomId('middleman_modal')
      .setTitle('Middleman Request');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('other_user')
          .setLabel('ID/User of the other person')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Discord ID or @mention')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('details & value')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('can_join')
          .setLabel('can both join private server link?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Yes / No')
      )
    );

    await interaction.showModal(modal);
    return;
  }

  // ─── Modal submit (both types) ─────────────────────────────────────
  if (interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });

    const isMiddleman = interaction.customId === 'middleman_modal';
    let namePrefix = isMiddleman ? 'mm-' : 'ticket-';
    let threadName = `${namePrefix}${interaction.user.username}`.slice(0, 90);

    let description = `**Opened by:** ${interaction.user}\n\n`;

    if (isMiddleman) {
      const other = interaction.fields.getTextInputValue('other_user');
      const details = interaction.fields.getTextInputValue('details');
      const join = interaction.fields.getTextInputValue('can_join');
      description += `**Other person:** ${other}\n**Details & Value:** ${details}\n**Can join priv server?** ${join}`;
    } else {
      description += `**Reason:** ${interaction.fields.getTextInputValue('reason')}`;
    }

    const thread = await interaction.channel.threads.create({
      name: threadName,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.GuildPrivateThread,
      reason: `${isMiddleman ? 'MM' : 'Ticket'} by ${interaction.user.tag}`,
      invitable: false
    });

    // Add creator
    await thread.members.add(interaction.user.id).catch(() => {});

    // Add all middleman role members
    const role = interaction.guild.roles.cache.get(MIDDLEMAN_ROLE_ID);
    if (role) {
      for (const member of role.members.values()) {
        if (!member.user.bot) {
          await thread.members.add(member.id).catch(() => {});
        }
      }
    }

    const color = isMiddleman ? '#ffaa00' : '#00ff9d';

    const embed = new EmbedBuilder()
      .setColor(color)
      .setDescription(description)
      .setTimestamp();

    const claimBtn = new ButtonBuilder().setCustomId('claim').setLabel('Claim').setStyle(ButtonStyle.Success);
    const closeBtn = new ButtonBuilder().setCustomId('close').setLabel('Close').setStyle(ButtonStyle.Danger);

    await thread.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(claimBtn, closeBtn)],
      content: role ? `<@&${MIDDLEMAN_ROLE_ID}>` : undefined
    });

    await interaction.editReply({ content: `Created → ${thread}`, ephemeral: true });
  }

  // ─── Claim button ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'claim') {
    if (!interaction.member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
      return interaction.reply({ content: `Only <@&${MIDDLEMAN_ROLE_ID}> can claim.`, ephemeral: true });
    }

    if (interaction.channel.name.includes('claimed-by-')) {
      return interaction.reply({ content: 'This ticket is already claimed.', ephemeral: true });
    }

    const newName = `${interaction.channel.name} - claimed-by-${interaction.user.id}`;
    await interaction.channel.setName(newName.slice(0, 100));

    await interaction.reply(`**Claimed by** ${interaction.user}`);
  }

  // ─── Close button ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'close') {
    await interaction.reply('Closing ticket in 10 seconds...');
    setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
  }
});

// ─── $add command (prefix) ───────────────────────────────────────────
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!message.content.startsWith('$')) return;
  if (!message.channel.isThread()) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === 'add') {
    if (!message.member.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
      return message.reply(`Only <@&${MIDDLEMAN_ROLE_ID}> can add users.`).then(m => setTimeout(() => m.delete(), 8000));
    }

    if (!args[0]) return message.reply('Usage: `$add @user` or `$add 123456789012345678`');

    const id = args[0].replace(/[<@!>]*/g, '');
    if (!/^\d{17,20}$/.test(id)) return message.reply('Invalid user ID or mention.');

    try {
      await message.channel.members.add(id);
      await message.channel.send(`${message.author} added <@${id}> to the ticket.`);
      await message.delete().catch(() => {});
    } catch (e) {
      await message.reply(`Failed: ${e.message}`).then(m => setTimeout(() => m.delete(), 10000));
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
