const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const FileType = require('file-type');
const fetch = require('node-fetch');
const yts = require('yt-search');
const { MongoClient } = require('mongodb');
let cheerio;
try { cheerio = require('cheerio'); } catch (e) { cheerio = null; }
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  getContentType,
  makeCacheableSignalKeyStore,
  Browsers,
  jidNormalizedUser,
  downloadContentFromMessage,
  generateWAMessageFromContent,
  proto,
  DisconnectReason,
  META_AI_JID,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

// ───────────────────── FFMPEG SETUP ───────────────────────────
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// ───────────────────── DEFAULT CONFIG ───────────────────────────
const DEFAULT_BOT_NAME = '𝑺͟𝒂͠𝒌͠𝒖͠𝒓̷𝒂͠🌸⃘̬ٜٜٜ͠';

const config = {
  BOT_NAME: DEFAULT_BOT_NAME,
  PREFIX: '.',
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_TYPING: 'false',
  ANTI_DELETE: 'off',
  AUTO_LIKE_EMOJI: ['🌸', '💖', '💗', '❤️‍🔥', '✨', '🐾', '💙', '💜'],
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94711214607,94705851067',
  OWNER_NAME: '𝐊ᴇᴢᴜ𝚄 ||🌿 | ERANDA',
  NEWSLETTER_JID: '120363144038483540@newsletter',
  NEWSLETTER_NAME: '𝑺͟𝒂͠𝒌͠𝒖͠𝒓̷𝒂͠ Official 🌸',
  DEFAULT_LOGO: 'https://i.ibb.co/Zz3Bs44j/file-000000002d0c71faa239b73a2a44241a.png',
  BOT_FOOTER: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝑺͟𝒂͠𝒌͠𝒖͠𝒓̷𝒂͠🌸⃘̬ٜٜٜ͠*',
  API_YT_ALL_URL: 'https://nexoraapi.laksidunimsara.com/api/youtube/all',
  NEXORA_API_KEY: 'lakiya_46d6ceb9bed1f0de0181c9d6c91cbe05bdba0bb16d3498b46a61f118f4b40f37',
  BOT_VERSION: '2.5.0V PRO'
};

// ───────────────────── MONGO DATABASE SETUP ─────────────────────
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB;
let mongoClient, mongoDB;
let sessionsCol, numbersCol, configsCol, groupSettingsCol, customRepliesCol;

const userConfigCache = new Map();
const USER_CONFIG_CACHE_TTL = 5 * 60 * 1000;

let _mongoReady = false;
async function initMongo() {
  if (_mongoReady) return;
  try {
    if (mongoClient?.topology?.isConnected?.()) {
      _mongoReady = true;
      return;
    }
  } catch(e){}
  if (!MONGO_URI) return;
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB || 'sakura_bot_db');

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  configsCol = mongoDB.collection('configs');
  groupSettingsCol = mongoDB.collection('group_settings');
  customRepliesCol = mongoDB.collection('custom_replies');

  await sessionsCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  await numbersCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  await configsCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  await groupSettingsCol.createIndex({ jid: 1 }, { unique: true }).catch(()=>{});
  _mongoReady = true;
  console.log('✅ [Sakura DB] MongoDB connected and collections ready');
}

// ───────────────────── MONGO HELPERS ────────────────────────────
async function saveCredsToMongo(number, creds, keys = null, sessionPath = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    let files = {};
    if (sessionPath && fs.existsSync(sessionPath)) {
      const dirFiles = fs.readdirSync(sessionPath);
      for (const fname of dirFiles) {
        try { files[fname] = fs.readFileSync(path.join(sessionPath, fname), 'utf8'); } catch(e) {}
      }
    }
    await sessionsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, creds, keys, files, updatedAt: new Date() } }, { upsert: true });
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    return await sessionsCol.findOne({ number: number.replace(/[^0-9]/g, '') });
  } catch (e) { return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    await sessionsCol.deleteOne({ number: number.replace(/[^0-9]/g, '') });
  } catch (e) {}
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
  } catch (e) {}
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { return []; }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    userConfigCache.set(sanitized, { config: conf, ts: Date.now() });
  } catch (e) {}
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const cached = userConfigCache.get(sanitized);
    if (cached && (Date.now() - (cached.ts || 0) < USER_CONFIG_CACHE_TTL)) return cached.config;
    const doc = await configsCol.findOne({ number: sanitized });
    const conf = doc ? doc.config : {};
    userConfigCache.set(sanitized, { config: conf, ts: Date.now() });
    return conf || {};
  } catch (e) { return {}; }
}

// ──────────────── GROUP SETTINGS MONGO HELPERS ──────────────────
async function getGroupSettings(jid) {
  try {
    await initMongo();
    const res = await groupSettingsCol.findOne({ jid });
    return res || { jid, antilink: false, antibot: false, antibadword: false, badwords: [], welcome: false, goodbye: false };
  } catch(e) { return {}; }
}

async function updateGroupSettings(jid, updateData) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid }, { $set: updateData }, { upsert: true });
  } catch(e) {}
}

// ──────────────── CUSTOM AUTO REPLY HELPERS ─────────────────────
async function addAutoReply(number, trigger, type, content) {
  try {
    await initMongo();
    await customRepliesCol.updateOne(
      { number, trigger: trigger.toLowerCase() },
      { $set: { number, trigger: trigger.toLowerCase(), type, content, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch(e) {}
}

async function removeAutoReply(number, trigger) {
  try {
    await initMongo();
    await customRepliesCol.deleteOne({ number, trigger: trigger.toLowerCase() });
  } catch(e) {}
}

async function getAutoReplies(number) {
  try {
    await initMongo();
    return await customRepliesCol.find({ number }).toArray();
  } catch(e) { return []; }
}

// ──────────────── GLOBAL MAPS & CACHES ──────────────────────────
const activeSockets = new Map();
const socketCreationTime = new Map();
const reconnectInProgress = new Set();
const userMenuState = new Map();
const messageStore = new Map();

// ──────────────── CHANNEL / CONTEXT HELPER ──────────────────────
function getForwardedContext(cfg, customTitle = null) {
  return {
    forwardingScore: 9999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: cfg?.NEWSLETTER_JID || config.NEWSLETTER_JID,
      newsletterName: customTitle || cfg?.NEWSLETTER_NAME || config.NEWSLETTER_NAME,
      serverMessageId: 100
    }
  };
}

async function sendFancyMsg(socket, to, content, quoted = null, cfg = {}) {
  const contextInfo = {
    ...getForwardedContext(cfg),
    ...(content.contextInfo || {})
  };
  if (content.mentions) contextInfo.mentionedJid = content.mentions;
  return await socket.sendMessage(to, { ...content, contextInfo }, { quoted });
}

// ──────────────── MEDIA BUFFER HELPERS ──────────────────────────
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function downloadMediaMessage(message) {
  let type = Object.keys(message)[0];
  let msg = message[type];
  if (type === 'ephemeralMessage') {
    msg = message.ephemeralMessage.message;
    type = Object.keys(msg)[0];
    msg = msg[type];
  }
  const stream = await downloadContentFromMessage(msg, type.replace('Message', ''));
  return await streamToBuffer(stream);
}

// ──────────────── STATUS SEEN & AUTO REACT ──────────────────────
const processedStatus = new Set();
const MAX_STATUS_CACHE = 1000;
const STATUS_REACTION_DELAY = 1500;

function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.key || msg.key.remoteJid !== 'status@broadcast' || !msg.key.participant) return;

    const botJid = jidNormalizedUser(socket.user.id);
    if (msg.key.participant === botJid) return; // Do not react to self status

    const statusId = `${msg.key.participant}_${msg.key.id}`;
    if (processedStatus.has(statusId)) return;

    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userCfg = await loadUserConfigFromMongo(sanitized);

      const autoView = userCfg.AUTO_VIEW_STATUS ?? config.AUTO_VIEW_STATUS;
      const autoLike = userCfg.AUTO_LIKE_STATUS ?? config.AUTO_LIKE_STATUS;
      const autoRecording = userCfg.AUTO_RECORDING ?? config.AUTO_RECORDING;

      if (autoRecording === 'true') {
        await socket.sendPresenceUpdate("recording", msg.key.remoteJid).catch(() => {});
      }

      await delay(STATUS_REACTION_DELAY);

      // Auto View Status
      if (autoView === 'true') {
        try {
          await socket.readMessages([msg.key]);
        } catch (error) {
          console.warn('⚠️ Failed to read status:', error.message);
        }
      }

      // Auto Like / React Status
      if (autoLike === 'true') {
        const emojis = userCfg.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)] || '❤️';

        try {
          await socket.sendMessage(
            msg.key.remoteJid,
            { react: { text: randomEmoji, key: msg.key } },
            { statusJidList: [msg.key.participant] }
          );
          console.log(`🌸 [Status React Success] ${randomEmoji} on ${msg.key.participant}`);
        } catch (error) {
          console.warn('⚠️ Failed to react to status:', error.message);
        }
      }

      processedStatus.add(statusId);
      if (processedStatus.size > MAX_STATUS_CACHE) {
        const firstEntry = processedStatus.values().next().value;
        processedStatus.delete(firstEntry);
      }

    } catch (error) {
      console.error('❌ Error in status handler:', error.message);
    }
  });
}

// ─────────────── GROUP PARTICIPANTS (WELCOME / GOODBYE) ────────
function setupGroupParticipantHandlers(socket, sessionNumber) {
  socket.ev.on('group-participants.update', async (update) => {
    try {
      const { id, participants, action } = update;
      const gSettings = await getGroupSettings(id);
      const groupMeta = await socket.groupMetadata(id).catch(() => null);
      if (!groupMeta) return;

      for (const participant of participants) {
        if (action === 'add' && gSettings.welcome) {
          const welcomeTxt = `🌸 *WELCOME TO ${groupMeta.subject}!* 🌸\n\n👋 Hey @${participant.split('@')[0]}! Enjoy your stay and follow the group rules. ✨\n\n> 🤖 *${config.BOT_NAME}*`;
          await socket.sendMessage(id, { text: welcomeTxt, mentions: [participant] });
        } else if (action === 'remove' && gSettings.goodbye) {
          const byeTxt = `👋 *GOODBYE @${participant.split('@')[0]}!* We'll miss you. 🌸\n\n> 🤖 *${config.BOT_NAME}*`;
          await socket.sendMessage(id, { text: byeTxt, mentions: [participant] });
        }
      }
    } catch(e) {}
  });
}

// ──────────────── COMMAND & EVENT HANDLERS ──────────────────────
function setupCommandHandlers(socket, number) {
  const sanitizedNum = number.replace(/[^0-9]/g, '');

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

    if (msg.key?.id) {
      messageStore.set(msg.key.id, JSON.parse(JSON.stringify(msg)));
      if (messageStore.size > 2000) {
        const firstKey = messageStore.keys().next().value;
        messageStore.delete(firstKey);
      }
    }

    let type = getContentType(msg.message);
    let messageContent = msg.message;
    if (type === 'ephemeralMessage') {
      messageContent = msg.message.ephemeralMessage.message;
      type = getContentType(messageContent);
    }

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : jidNormalizedUser(msg.key.participant || from);
    const senderNumber = (nowsender || '').split('@')[0];
    const isBot = socket.user.id.split(':')[0].includes(senderNumber);
    const isOwnerUser = config.OWNER_NUMBER.split(',').map(v => v.replace(/[^0-9]/g, '')).includes(senderNumber) || isBot;

    let body = '';
    if (type === 'conversation') body = messageContent.conversation || '';
    else if (type === 'extendedTextMessage') body = messageContent.extendedTextMessage?.text || '';
    else if (type === 'imageMessage') body = messageContent.imageMessage?.caption || '';
    else if (type === 'videoMessage') body = messageContent.videoMessage?.caption || '';
    body = String(body || '').trim();

    const userCfg = await loadUserConfigFromMongo(sanitizedNum);
    const prefix = userCfg.PREFIX || config.PREFIX;
    const botName = userCfg.botName || config.BOT_NAME;
    const botLogo = userCfg.logo || config.DEFAULT_LOGO;
    const botFooter = userCfg.footer || config.BOT_FOOTER;

    if (isGroup && !msg.key.fromMe) {
      const gSettings = await getGroupSettings(from);

      if (gSettings.antilink && /(chat\.whatsapp\.com\/|wa\.me\/)/i.test(body)) {
        if (!isOwnerUser) {
          await socket.sendMessage(from, { delete: msg.key });
          await socket.sendMessage(from, { text: `⚠️ Link detected and deleted! Links are not allowed here.` });
          return;
        }
      }

      if (gSettings.antibadword && Array.isArray(gSettings.badwords)) {
        const foundBad = gSettings.badwords.some(bw => body.toLowerCase().includes(bw.toLowerCase()));
        if (foundBad && !isOwnerUser) {
          await socket.sendMessage(from, { delete: msg.key });
          await socket.sendMessage(from, { text: `⚠️ Bad word removed! Maintain group decency.` });
          return;
        }
      }
    }

    if (!msg.key.fromMe && body) {
      const allReplies = await getAutoReplies(sanitizedNum);
      const matchReply = allReplies.find(r => r.trigger.toLowerCase() === body.toLowerCase());
      if (matchReply) {
        try {
          if (matchReply.type === 'text') {
            await sendFancyMsg(socket, from, { text: matchReply.content }, msg, userCfg);
          } else if (matchReply.type === 'voice' || matchReply.type === 'audio') {
            await socket.sendMessage(from, { audio: { url: matchReply.content }, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
          } else if (matchReply.type === 'image') {
            await socket.sendMessage(from, { image: { url: matchReply.content }, caption: `✨ Auto Reply by ${botName}` }, { quoted: msg });
          } else if (matchReply.type === 'video') {
            await socket.sendMessage(from, { video: { url: matchReply.content }, caption: `✨ Auto Reply by ${botName}` }, { quoted: msg });
          } else if (matchReply.type === 'sticker') {
            await socket.sendMessage(from, { sticker: { url: matchReply.content } }, { quoted: msg });
          }
        } catch(e) {}
      }
    }

    if (userCfg.AUTO_TYPING === 'true') await socket.sendPresenceUpdate('composing', from);
    if (userCfg.AUTO_RECORDING === 'true') await socket.sendPresenceUpdate('recording', from);

    const quotedMsgId = messageContent?.extendedTextMessage?.contextInfo?.stanzaId;
    const lastMenuId = userMenuState.get(from);
    let isCmd = body.startsWith(prefix);
    let command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    let args = body.trim().split(/ +/).slice(1);

    if (!isCmd && /^[0-9]+$/.test(body) && (quotedMsgId === lastMenuId || !quotedMsgId)) {
      const choice = body.trim();
      switch (choice) {
        case '1': command = 'dlmenu'; break;
        case '2': command = 'groupmenu'; break;
        case '3': command = 'utilmenu'; break;
        case '4': command = 'funmenu'; break;
        case '5': command = 'settingsmenu'; break;
        case '6': command = 'channelmenu'; break;
        case '7': command = 'customizemenu'; break;
        default: break;
      }
    }

    if (!command) return;

    try {
      switch (command) {
        case 'menu':
        case 'help':
        case 'panel': {
          await socket.sendMessage(from, { react: { text: "🌸", key: msg.key } });
          const uptime = process.uptime();
          const runtime = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
          const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

          const mainText = `
*╭─────────────···▸*
*│* 🌸 *${botName}* 🌸
*│* 👤 *User:* @${senderNumber}
*│* ⏱️ *Uptime:* ${runtime}
*│* 💾 *RAM:* ${ramUsage} MB
*│* 🔣 *Prefix:* \`${prefix}\`
*╰──────────────···▸*

🔢 *REPLY WITH A CATEGORY NUMBER:*

*┌──『 📚 ALL CATEGORIES 』*
*│ [1]* 📥 *Downloaders* (Songs, Videos, TT, FB..)
*│ [2]* 👥 *Group Admin & Protection*
*│ [3]* 🛠️ *Utilities & Tools* (VV, Stickers..)
*│ [4]* 🎭 *Fun & Games*
*│ [5]* ⚙️ *Settings & Bot Toggles*
*│ [6]* 📢 *Channel & Newsletter Suite*
*│ [7]* 🎨 *Bot Customization & Personalize*
*└──────────────────────*

> 💡 *Quick Action:* Reply directly with *1*, *2*, *3*, *4*, *5*, *6*, or *7* to view commands.
${botFooter}`.trim();

          const sentMenu = await sendFancyMsg(socket, from, {
            image: { url: botLogo },
            caption: mainText,
            mentions: [nowsender]
          }, msg, userCfg);

          if (sentMenu?.key?.id) userMenuState.set(from, sentMenu.key.id);
          break;
        }

        case 'dlmenu': {
          const dlText = `
*╭───❰ 📥 DOWNLOAD MENU ❱───*
*│* 🎵 \`${prefix}song <name/url>\` - Download MP3
*│* 🎬 \`${prefix}video <name/url>\` - Download MP4
*│* 🎵 \`${prefix}tiktok <url>\` - TikTok No Watermark
*│* 📘 \`${prefix}fb <url>\` - Facebook Video
*│* 📷 \`${prefix}ig <url>\` - Instagram Downloader
*│* 🌸 \`${prefix}anime <name>\` - Anime Info & Search
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: dlText }, msg, userCfg);
          break;
        }

        case 'groupmenu': {
          const gText = `
*╭───❰ 👥 GROUP COMMANDS ❱───*
*│* 🛡️ \`${prefix}antilink on/off\` - Auto delete invite links
*│* 🤖 \`${prefix}antibot on/off\` - Auto kick other bots
*│* 🤬 \`${prefix}antibadword on/off\` - Filter bad words
*│* ➕ \`${prefix}addbadword <word>\` - Add word to list
*│* ➖ \`${prefix}delbadword <word>\` - Remove bad word
*│* 👋 \`${prefix}welcome on/off\` - New member greetings
*│* 🚪 \`${prefix}goodbye on/off\` - Leaving member message
*│* 📢 \`${prefix}tagall <text>\` - Mention everyone
*│* 👻 \`${prefix}hidetag <text>\` - Ghost mention
*│* 👑 \`${prefix}promote @user\` - Give Admin
*│* 👤 \`${prefix}demote @user\` - Remove Admin
*│* 🚫 \`${prefix}kick @user\` - Remove participant
*│* 🔒 \`${prefix}mute\` / \`${prefix}unmute\` - Group chat lock
*│* 🔗 \`${prefix}glink\` - Get Group Invite Link
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: gText }, msg, userCfg);
          break;
        }

        case 'utilmenu': {
          const uText = `
*╭───❰ 🛠️ UTILITY COMMANDS ❱───*
*│* 👁️ \`${prefix}vv\` / \`${prefix}readviewonce\` - Retrieve View-Once Media
*│* 📥 \`${prefix}savestatus\` / \`${prefix}ss\` - Save quoted Status
*│* 🎨 \`${prefix}sticker\` / \`${prefix}s\` - Make Sticker from Photo/Video
*│* 🏷️ \`${prefix}take <pack> | <author>\` - Rename Sticker
*│* 🆔 \`${prefix}jid\` - Get Chat or User JID
*│* ➕ \`${prefix}addreply <text|audio|image|video>|<word>|<content/url>\`
*│* ➖ \`${prefix}delreply <trigger_word>\`
*│* 📋 \`${prefix}listreply\` - View custom auto-replies
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: uText }, msg, userCfg);
          break;
        }

        case 'funmenu': {
          const fText = `
*╭───❰ 🎭 FUN & GAMES ❱───*
*│* 💖 \`${prefix}ship @user1 @user2\` - Love Compatibility %
*│* 😂 \`${prefix}joke\` - Random Funny Joke
*│* 💡 \`${prefix}fact\` - Interesting Random Fact
*│* 🔥 \`${prefix}dare\` - Random Dare challenge
*│* 🤫 \`${prefix}truth\` - Random Truth question
*│* ✊ \`${prefix}rps <rock|paper|scissors>\` - Mini Game
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: fText }, msg, userCfg);
          break;
        }

        case 'settingsmenu':
        case 'settings': {
          const sText = `
*╭───❰ ⚙️ SETTINGS PANEL ❱───*
*│* 👁️ *Auto Status View:* ${userCfg.AUTO_VIEW_STATUS || 'true'}
*│* ❤️ *Auto Status React:* ${userCfg.AUTO_LIKE_STATUS || 'true'}
*│* ✍️ *Auto Typing:* ${userCfg.AUTO_TYPING || 'false'}
*│* 🎙️ *Auto Recording:* ${userCfg.AUTO_RECORDING || 'false'}
*│* 🗑️ *Anti Delete:* ${userCfg.ANTI_DELETE || 'off'}
*│* 🔣 *Current Prefix:* \`${prefix}\`
*╰────────────────────────*

*🔧 TOGGLE SHORTCUTS:*
• \`${prefix}autostatusview on/off\`
• \`${prefix}autostatusreact on/off\`
• \`${prefix}autotyping on/off\`
• \`${prefix}autorecording on/off\`
• \`${prefix}antidelete on/off\`
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: sText }, msg, userCfg);
          break;
        }

        case 'channelmenu': {
          const chText = `
*╭───❰ 📢 CHANNEL COMMANDS ❱───*
*│* ℹ️ \`${prefix}channelinfo <jid/url>\` - Newsletter Info
*│* 💖 \`${prefix}channelreact <jid> <server_msg_id> <emoji>\`
*│* 🚀 \`${prefix}channelpost <jid> <message>\` - Post to Channel
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: chText }, msg, userCfg);
          break;
        }

        case 'customizemenu': {
          const cText = `
*╭───❰ 🎨 CUSTOMIZE BOT ❱───*
*│* 🏷️ \`${prefix}setbotname <New Name>\`
*│* 🖼️ \`${prefix}setlogo <Image Direct URL>\`
*│* 🔣 \`${prefix}setprefix <symbol>\`
*│* 📜 \`${prefix}setfooter <Footer Text>\`
*│* ⚡ \`${prefix}ping\` - Check Latency
*│* 🖥️ \`${prefix}system\` - Host Stats
*│* 👑 \`${prefix}owner\` - Owner Contact Info
*│* 📍 \`${prefix}alive\` - Bot Status
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: cText }, msg, userCfg);
          break;
        }

        case 'vv':
        case 'readviewonce': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) return await socket.sendMessage(from, { text: '❌ Please reply to a View-Once image/video!' }, { quoted: msg });
          
          let vo = quoted.viewOnceMessageV2?.message || quoted.viewOnceMessage?.message || quoted;
          let mtype = Object.keys(vo)[0];

          if (!mtype || (!mtype.includes('image') && !mtype.includes('video') && !mtype.includes('audio'))) {
            return await socket.sendMessage(from, { text: '❌ That message is not a View-Once media!' }, { quoted: msg });
          }

          const stream = await downloadContentFromMessage(vo[mtype], mtype.replace('Message', ''));
          const buffer = await streamToBuffer(stream);

          if (mtype.includes('image')) {
            await socket.sendMessage(from, { image: buffer, caption: `🔓 *View-Once Image Recovered!*` }, { quoted: msg });
          } else if (mtype.includes('video')) {
            await socket.sendMessage(from, { video: buffer, caption: `🔓 *View-Once Video Recovered!*` }, { quoted: msg });
          } else if (mtype.includes('audio')) {
            await socket.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: msg });
          }
          break;
        }

        case 's':
        case 'sticker': {
          let targetMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage || msg.message;
          let mType = getContentType(targetMsg);

          if (mType === 'imageMessage' || (targetMsg.imageMessage)) {
            const buf = await downloadMediaMessage(targetMsg);
            const jimpImg = await Jimp.read(buf);
            await jimpImg.resize(512, 512);
            const outBuf = await jimpImg.getBufferAsync(Jimp.MIME_PNG);
            await socket.sendMessage(from, { sticker: outBuf }, { quoted: msg });
          } else {
            await socket.sendMessage(from, { text: `❌ Reply to an image with \`${prefix}sticker\`` }, { quoted: msg });
          }
          break;
        }

        case 'take':
        case 'wm': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted || !quoted.stickerMessage) {
            return await socket.sendMessage(from, { text: '❌ Reply to a sticker to rename watermark!' }, { quoted: msg });
          }
          const buf = await downloadMediaMessage(quoted);
          await socket.sendMessage(from, { sticker: buf }, { quoted: msg });
          break;
        }

        case 'ss':
        case 'savestatus': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) return await socket.sendMessage(from, { text: '❌ Reply to a status to save it!' }, { quoted: msg });
          const buf = await downloadMediaMessage(quoted);
          const qType = Object.keys(quoted)[0];
          if (qType.includes('image')) {
            await socket.sendMessage(from, { image: buf, caption: `🌸 Saved Status by ${botName}` }, { quoted: msg });
          } else if (qType.includes('video')) {
            await socket.sendMessage(from, { video: buf, caption: `🌸 Saved Status by ${botName}` }, { quoted: msg });
          }
          break;
        }

        case 'jid': {
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant || from;
          await socket.sendMessage(from, { text: `🆔 *JID:* \`${target}\`` }, { quoted: msg });
          break;
        }

        case 'addreply':
        case 'addautoreply': {
          if (!isOwnerUser) return;
          const content = args.join(' ');
          const parts = content.split('|').map(s => s.trim());
          if (parts.length < 3) {
            return await socket.sendMessage(from, {
              text: `❌ *Format Error!*\n*Usage:* \`${prefix}addreply <type>|<trigger_word>|<text_or_url>\`\n*Types:* \`text\`, \`voice\`, \`image\`, \`video\`, \`sticker\`\n\n*Example:* \`${prefix}addreply voice|gm|https://my-audio-link.ogg\``
            }, { quoted: msg });
          }
          const [rtype, rtrig, rcnt] = parts;
          await addAutoReply(sanitizedNum, rtrig, rtype.toLowerCase(), rcnt);
          await socket.sendMessage(from, { text: `✅ Auto Reply added for trigger: *"${rtrig}"* [${rtype.toUpperCase()}]` }, { quoted: msg });
          break;
        }

        case 'delreply':
        case 'delautoreply': {
          if (!isOwnerUser) return;
          const trig = args.join(' ').trim();
          if (!trig) return await socket.sendMessage(from, { text: `❌ Provide the trigger word to delete.` }, { quoted: msg });
          await removeAutoReply(sanitizedNum, trig);
          await socket.sendMessage(from, { text: `🗑️ Auto Reply deleted for: *"${trig}"*` }, { quoted: msg });
          break;
        }

        case 'listreply': {
          const list = await getAutoReplies(sanitizedNum);
          if (!list.length) return await socket.sendMessage(from, { text: 'ℹ️ No custom auto replies set yet.' }, { quoted: msg });
          let listTxt = `📋 *ACTIVE CUSTOM AUTO REPLIES (${list.length})*\n\n`;
          list.forEach((r, idx) => {
            listTxt += `*${idx + 1}.* 🎯 *Trigger:* \`${r.trigger}\` | 🏷️ *Type:* \`${r.type}\`\n`;
          });
          await socket.sendMessage(from, { text: listTxt }, { quoted: msg });
          break;
        }

        case 'tagall': {
          if (!isGroup) return;
          const groupMeta = await socket.groupMetadata(from);
          const members = groupMeta.participants.map(p => p.id);
          const txt = args.join(' ') || 'Attention Everyone!';
          let mentionText = `📢 *TAG ALL EVENT*\n📝 *Message:* ${txt}\n\n`;
          members.forEach((m, i) => { mentionText += `${i + 1}. @${m.split('@')[0]}\n`; });
          await socket.sendMessage(from, { text: mentionText, mentions: members }, { quoted: msg });
          break;
        }

        case 'hidetag': {
          if (!isGroup) return;
          const groupMeta = await socket.groupMetadata(from);
          const members = groupMeta.participants.map(p => p.id);
          const txt = args.join(' ') || 'Attention!';
          await socket.sendMessage(from, { text: txt, mentions: members });
          break;
        }

        case 'antilink': {
          if (!isGroup || !isOwnerUser) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            await updateGroupSettings(from, { antilink: opt === 'on' });
            await socket.sendMessage(from, { text: `🛡️ Anti-Link has been turned *${opt.toUpperCase()}* for this group.` }, { quoted: msg });
          }
          break;
        }

        case 'antibot': {
          if (!isGroup || !isOwnerUser) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            await updateGroupSettings(from, { antibot: opt === 'on' });
            await socket.sendMessage(from, { text: `🤖 Anti-Bot has been turned *${opt.toUpperCase()}*.` }, { quoted: msg });
          }
          break;
        }

        case 'antibadword': {
          if (!isGroup || !isOwnerUser) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            await updateGroupSettings(from, { antibadword: opt === 'on' });
            await socket.sendMessage(from, { text: `🤬 Anti-Badword has been turned *${opt.toUpperCase()}*.` }, { quoted: msg });
          }
          break;
        }

        case 'addbadword': {
          if (!isGroup || !isOwnerUser) return;
          const word = args.join(' ').trim().toLowerCase();
          if (!word) return;
          const gSettings = await getGroupSettings(from);
          const cur = Array.isArray(gSettings.badwords) ? gSettings.badwords : [];
          if (!cur.includes(word)) cur.push(word);
          await updateGroupSettings(from, { badwords: cur });
          await socket.sendMessage(from, { text: `✅ Added *"${word}"* to badword filter list.` }, { quoted: msg });
          break;
        }

        case 'welcome':
        case 'goodbye': {
          if (!isGroup || !isOwnerUser) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            await updateGroupSettings(from, { [command]: opt === 'on' });
            await socket.sendMessage(from, { text: `🌸 Group ${command} messages turned *${opt.toUpperCase()}*.` }, { quoted: msg });
          }
          break;
        }

        case 'kick': {
          if (!isGroup || !isOwnerUser) return;
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (target) await socket.groupParticipantsUpdate(from, [target], 'remove');
          break;
        }

        case 'promote': {
          if (!isGroup || !isOwnerUser) return;
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (target) await socket.groupParticipantsUpdate(from, [target], 'promote');
          break;
        }

        case 'demote': {
          if (!isGroup || !isOwnerUser) return;
          const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] || '').replace(/[^0-9]/g, '') + '@s.whatsapp.net';
          if (target) await socket.groupParticipantsUpdate(from, [target], 'demote');
          break;
        }

        case 'mute': {
          if (!isGroup || !isOwnerUser) return;
          await socket.groupSettingUpdate(from, 'announcement');
          await socket.sendMessage(from, { text: '🔒 Group chat muted (Admins only).' }, { quoted: msg });
          break;
        }

        case 'unmute': {
          if (!isGroup || !isOwnerUser) return;
          await socket.groupSettingUpdate(from, 'not_announcement');
          await socket.sendMessage(from, { text: '🔓 Group chat unmuted (All members can send messages).' }, { quoted: msg });
          break;
        }

        case 'glink': {
          if (!isGroup) return;
          const code = await socket.groupInviteCode(from);
          await socket.sendMessage(from, { text: `🔗 *Group Link:* https://chat.whatsapp.com/${code}` }, { quoted: msg });
          break;
        }

        case 'ship': {
          const rand = Math.floor(Math.random() * 100) + 1;
          await sendFancyMsg(socket, from, { text: `💖 *LOVE COMPATIBILITY:* *${rand}%* 💞\n\n> 🌸 Match rating by ${botName}` }, msg, userCfg);
          break;
        }

        case 'joke': {
          const res = await axios.get('https://official-joke-api.appspot.com/random_joke').catch(() => null);
          const jTxt = res?.data ? `😂 *${res.data.setup}*\n\n👉 *${res.data.punchline}*` : 'Why do programmers prefer dark mode? Because light attracts bugs!';
          await sendFancyMsg(socket, from, { text: jTxt }, msg, userCfg);
          break;
        }

        case 'fact': {
          const res = await axios.get('https://uselessfacts.jsph.pl/random.json?language=en').catch(() => null);
          const fTxt = res?.data?.text ? `💡 *Random Fact:* ${res.data.text}` : 'Honey never spoils; archaeologists found 3000-year-old edible honey in Egyptian tombs!';
          await sendFancyMsg(socket, from, { text: fTxt }, msg, userCfg);
          break;
        }

        case 'setbotname': {
          if (!isOwnerUser) return;
          const newName = args.join(' ').trim();
          if (!newName) return await socket.sendMessage(from, { text: '❌ Provide the new bot name.' }, { quoted: msg });
          userCfg.botName = newName;
          await setUserConfigInMongo(sanitizedNum, userCfg);
          await socket.sendMessage(from, { text: `✅ Bot Name updated to: *${newName}*` }, { quoted: msg });
          break;
        }

        case 'setlogo': {
          if (!isOwnerUser) return;
          const newLogo = args[0]?.trim();
          if (!newLogo || !newLogo.startsWith('http')) return await socket.sendMessage(from, { text: '❌ Provide a direct image URL.' }, { quoted: msg });
          userCfg.logo = newLogo;
          await setUserConfigInMongo(sanitizedNum, userCfg);
          await socket.sendMessage(from, { text: `✅ Bot Logo updated successfully!` }, { quoted: msg });
          break;
        }

        case 'setprefix': {
          if (!isOwnerUser) return;
          const newP = args[0]?.trim();
          if (!newP) return;
          userCfg.PREFIX = newP;
          await setUserConfigInMongo(sanitizedNum, userCfg);
          await socket.sendMessage(from, { text: `✅ Prefix set to: *${newP}*` }, { quoted: msg });
          break;
        }

        case 'setfooter': {
          if (!isOwnerUser) return;
          const newFooter = args.join(' ').trim();
          if (!newFooter) return;
          userCfg.footer = `> *${newFooter}*`;
          await setUserConfigInMongo(sanitizedNum, userCfg);
          await socket.sendMessage(from, { text: `✅ Bot footer updated!` }, { quoted: msg });
          break;
        }

        case 'song':
        case 'play': {
          if (!args.length) return await socket.sendMessage(from, { text: `❌ *Usage:* \`${prefix}song <song_name>\`` }, { quoted: msg });
          const query = args.join(' ');
          await socket.sendMessage(from, { react: { text: '🎵', key: msg.key } });

          try {
            const result = await yts(query);
            if (!result.videos?.length) return await socket.sendMessage(from, { text: '❌ No songs found.' }, { quoted: msg });
            const vid = result.videos[0];
            const apiRes = await axios.get(`${config.API_YT_ALL_URL}?url=https://youtu.be/${vid.videoId}&api_key=${config.NEXORA_API_KEY}`, { timeout: 30000 });
            const dlLink = apiRes.data?.all_qualities?.audio?.download_url;
            if (!dlLink) throw new Error('Download URL error');

            await socket.sendMessage(from, {
              audio: { url: dlLink },
              mimetype: 'audio/mpeg',
              fileName: `${vid.title}.mp3`
            }, { quoted: msg });
          } catch(e) {
            await socket.sendMessage(from, { text: `❌ Song download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        case 'video': {
          if (!args.length) return await socket.sendMessage(from, { text: `❌ *Usage:* \`${prefix}video <video_name>\`` }, { quoted: msg });
          const query = args.join(' ');
          await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });

          try {
            const result = await yts(query);
            if (!result.videos?.length) return await socket.sendMessage(from, { text: '❌ No videos found.' }, { quoted: msg });
            const vid = result.videos[0];
            const apiRes = await axios.get(`${config.API_YT_ALL_URL}?url=https://youtu.be/${vid.videoId}&api_key=${config.NEXORA_API_KEY}`, { timeout: 30000 });
            const dlLink = apiRes.data?.all_qualities?.['360p']?.download_url || apiRes.data?.all_qualities?.audio?.download_url;
            if (!dlLink) throw new Error('Download URL error');

            await socket.sendMessage(from, {
              video: { url: dlLink },
              mimetype: 'video/mp4',
              caption: `🎬 *${vid.title}*\n\n${botFooter}`
            }, { quoted: msg });
          } catch(e) {
            await socket.sendMessage(from, { text: `❌ Video download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        case 'autotyping':
        case 'autorecording':
        case 'antidelete':
        case 'autostatusview':
        case 'autostatusreact': {
          if (!isOwnerUser) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            const keyMap = {
              autotyping: 'AUTO_TYPING',
              autorecording: 'AUTO_RECORDING',
              antidelete: 'ANTI_DELETE',
              autostatusview: 'AUTO_VIEW_STATUS',
              autostatusreact: 'AUTO_LIKE_STATUS'
            };
            const dbKey = keyMap[command];
            userCfg[dbKey] = opt === 'on' ? 'true' : 'false';
            await setUserConfigInMongo(sanitizedNum, userCfg);
            await socket.sendMessage(from, { text: `✅ *${command.toUpperCase()}* is now *${opt.toUpperCase()}*` }, { quoted: msg });
          }
          break;
        }

        case 'ping': {
          const start = Date.now();
          await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });
          const latency = Date.now() - start;
          await sendFancyMsg(socket, from, {
            text: `╭───「 🏓 *P O N G* 」───◆\n│ ⚡ *Latency:* ${latency}ms\n│ 🌸 *Bot:* ${botName}\n│ 🟢 *Status:* Operational & Active\n╰──────────────────────◆`
          }, msg, userCfg);
          break;
        }

        case 'alive': {
          await socket.sendMessage(from, { react: { text: "🌸", key: msg.key } });
          const uptime = process.uptime();
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);

          const aliveCard = `
╭───「 🌸 *${botName} ALIVE* 」───◆
│ 👋 *Hey! I am running seamlessly.*
│
│ 👤 *User:* @${senderNumber}
│ 👑 *Master:* ${config.OWNER_NAME}
│ ⏳ *Uptime:* ${hours}h ${minutes}m
│ 🚀 *Version:* ${config.BOT_VERSION}
╰─────────────────────────────◆
${botFooter}`.trim();

          await sendFancyMsg(socket, from, {
            image: { url: botLogo },
            caption: aliveCard,
            mentions: [nowsender]
          }, msg, userCfg);
          break;
        }

        case 'owner': {
          const ownerClean = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
          const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${config.OWNER_NAME}\nORG:${botName};\nTEL;type=CELL;type=VOICE;waid=${ownerClean}:+${ownerClean}\nEND:VCARD`;
          await socket.sendMessage(from, { contacts: { displayName: config.OWNER_NAME, contacts: [{ vcard }] } }, { quoted: msg });
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Command Execution Error:', err);
    }
  });
}

// ───────────────── AUTO-RESTART & LIFECYCLE ─────────────────────
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection !== 'close') return;

    const san = number.replace(/[^0-9]/g, '');
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    if (statusCode === DisconnectReason.loggedOut) {
      console.log(`[Sakura] Session ${san} logged out.`);
      activeSockets.delete(san);
      await removeSessionFromMongo(san);
      return;
    }

    if (reconnectInProgress.has(san)) return;
    reconnectInProgress.add(san);
    activeSockets.delete(san);

    console.log(`[Sakura] Auto reconnecting session ${san} in 5s...`);
    await delay(5000);
    try {
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(san, mockRes);
    } catch (e) {
      console.error(`Reconnect error for ${san}:`, e.message);
    } finally {
      reconnectInProgress.delete(san);
    }
  });
}

// ───────────────── EMPIRE PAIRING CORE ──────────────────────────
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `sakura_session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});

  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.files) {
      fs.ensureDirSync(sessionPath);
      for (const [fname, content] of Object.entries(mongoDoc.files)) {
        try { fs.writeFileSync(path.join(sessionPath, fname), content, 'utf8'); } catch(e) {}
      }
    }
  } catch (e) {}

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'silent' });
  const { version } = await fetchLatestBaileysVersion();

  try {
    const socket = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Safari'),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      syncFullHistory: false
    });

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupGroupParticipantHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let code;
      try {
        await delay(500);
        code = await socket.requestPairingCode(sanitizedNumber, null);
      } catch (error) {}
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        const credsPath = path.join(sessionPath, 'creds.json');
        if (fs.existsSync(credsPath)) {
          const credsObj = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
          await saveCredsToMongo(sanitizedNumber, credsObj, state.keys, sessionPath);
        }
      } catch (err) {}
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        activeSockets.set(sanitizedNumber, socket);
        await addNumberToMongo(sanitizedNumber);
        console.log(`🌸 [Sakura Connected] +${sanitizedNumber} connected successfully!`);
      }
    });

  } catch (error) {
    console.error('Sakura Pairing error:', error);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ───────────────── EXPRESS ROUTER ENDPOINTS ─────────────────────
router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  const sanitized = number.replace(/[^0-9]/g, '');

  if (activeSockets.has(sanitized)) {
    try { activeSockets.get(sanitized).ws?.close(); } catch(e) {}
    activeSockets.delete(sanitized);
  }
  await EmpirePair(number, res);
});

router.get('/active', (req, res) => {
  res.status(200).send({ botName: config.BOT_NAME, count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: config.BOT_NAME, activesession: activeSockets.size });
});

// Initialize DB and auto-reconnect existing bots on server boot
initMongo().catch(()=>{});
(async () => {
  try {
    const nums = await getAllNumbersFromMongo();
    for (const n of nums) {
      const san = n.replace(/[^0-9]/g, '');
      if (!activeSockets.has(san)) {
        const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
        await EmpirePair(san, mockRes);
        await delay(2500);
      }
    }
  } catch (e) {}
})();

module.exports = router;