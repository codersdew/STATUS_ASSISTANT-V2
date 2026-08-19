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

const isJidMetaAi = (jid) => typeof jid === 'string' && jid.includes('@lid') && META_AI_JID && jid === META_AI_JID;

// ────────────────────────────────────────────────
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegPath);

// ───────────────────── CONFIG SETTING ───────────────────────────
const BOT_NAME_FANCY = '🤖 Status Assistant';

const config = {
  AUTO_VIEW_STATUS: 'true',
  AUTO_LIKE_STATUS: 'true',
  AUTO_RECORDING: 'false',
  AUTO_LIKE_EMOJI: ['💙', '🩷', '💜', '🧡', '🩵', '💛', '♥️', '💗', '❤️‍🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'xxxxxxxxxxx',
  KEZU_IMG: 'https://i.ibb.co/Zz3Bs44j/file-000000002d0c71faa239b73a2a44241a.png',
  NEWSLETTER_JID: '000000000000000@newsletter',
  OTP_EXPIRY: 300000,
  WORK_TYPE: 'public',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94711214607,94705851067',
  CHANNEL_LINK: 'https://whatsapp.com/channel/xxxxxxxxxxxxx',
  BOT_NAME: '🤖 Status Assistant',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: '𝐊ᴇᴢᴜ𝚄 ||🌿 | ERANDA',
  IMAGE_PATH: 'https://i.ibb.co/Zz3Bs44j/file-000000002d0c71faa239b73a2a44241a.png',
  BOT_FOOTER: '> *🤖 Status Assistant*',
  API_YTMP3_URL: 'https://nexora.laksidunimsara.com/api/ytmp3',
  API_YTMP4_URL: 'https://nexora.laksidunimsara.com/api/youtube/mp4',
  API_YT_ALL_URL: 'https://nexoraapi.laksidunimsara.com/api/youtube/all',
  NEXORA_API_KEY: 'lakiya_46d6ceb9bed1f0de0181c9d6c91cbe05bdba0bb16d3498b46a61f118f4b40f37',
  BOT_IMAGES: { ALIVE: 'https://i.ibb.co/Zz3Bs44j/file-000000002d0c71faa239b73a2a44241a.png' }
};

// ─────────── OWNER HELPER ───────────────────────
const isOwner = (num) => {
  const clean = (n) => (n || '').replace(/[^0-9]/g, '');
  return config.OWNER_NUMBER.split(',').map(clean).includes(clean(num));
};

// ---------------- MONGO SETUP ----------------
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB;
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol, groupSettingsCol, autoTTSendCol, autoSongSendCol;

const userConfigCache = new Map();
const USER_CONFIG_CACHE_TTL = 10 * 60 * 1000;

let _mongoReady = false;
async function initMongo() {
  if (_mongoReady) return;
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) {
      _mongoReady = true;
      return;
    }
  } catch(e){}
  if (!MONGO_URI) return;
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB || 'whatsapp_bot');

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');
  groupSettingsCol = mongoDB.collection('group_settings');
  autoTTSendCol = mongoDB.collection('autottsend');
  autoSongSendCol = mongoDB.collection('autosongsend');

  await sessionsCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  await numbersCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  await newsletterCol.createIndex({ jid: 1 }, { unique: true }).catch(()=>{});
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true }).catch(()=>{});
  await configsCol.createIndex({ number: 1 }, { unique: true }).catch(()=>{});
  _mongoReady = true;
  console.log('✅ Mongo initialized and collections ready');
}

// ---------------- Mongo helpers ----------------
async function saveCredsToMongo(number, creds, keys = null, sessionPath = null) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    let files = {};
    if (sessionPath && fs.existsSync(sessionPath)) {
      const dirFiles = fs.readdirSync(sessionPath);
      for (const fname of dirFiles) {
        try {
          files[fname] = fs.readFileSync(path.join(sessionPath, fname), 'utf8');
        } catch(e) {}
      }
    }
    const doc = { number: sanitized, creds, keys, files, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await sessionsCol.findOne({ number: sanitized });
  } catch (e) { return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
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
    if (cached && (Date.now() - (cached.ts || 0) < USER_CONFIG_CACHE_TTL)) {
      return cached.config;
    }
    const doc = await configsCol.findOne({ number: sanitized });
    const conf = doc ? doc.config : null;
    userConfigCache.set(sanitized, { config: conf, ts: Date.now() });
    return conf;
  } catch (e) { return null; }
}

const activeSockets = new Map();
const socketCreationTime = new Map();
const reconnectInProgress = new Set();
const userMenuState = new Map(); // Store state for Number replies

const _msgRateLimiter = new Map();
const MSG_RATE_LIMIT = 35;
const MSG_RATE_WINDOW = 60000;

function _checkRateLimit(number) {
  const now = Date.now();
  let r = _msgRateLimiter.get(number);
  if (!r || now > r.resetAt) {
    r = { count: 0, resetAt: now + MSG_RATE_WINDOW };
    _msgRateLimiter.set(number, r);
  }
  if (r.count >= MSG_RATE_LIMIT) return false;
  r.count++;
  return true;
}

// ── Auto Voice reply map ──
const _VOICE_REPLIES = {
  'gm': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',
  'good morning': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',
  'gn': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/gn.mp3',
  'good night': 'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/good%20night.mp3',
  'hi': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hey': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hello': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'bot': 'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg'
};

// ---------------- Status Seen & React Handler (FIXED) ----------------
const _seenStatusIds = new Set();

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast') return;

    const _statusMsgId = message.key.id;
    if (_seenStatusIds.has(_statusMsgId)) return;
    _seenStatusIds.add(_statusMsgId);

    // Limit cache size
    if (_seenStatusIds.size > 2000) _seenStatusIds.clear();

    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userCfg = sessionNumber ? (await loadUserConfigFromMongo(sanitized) || {}) : {};

      const autoViewStatus = userCfg.AUTO_VIEW_STATUS ?? config.AUTO_VIEW_STATUS;
      const autoLikeStatus = userCfg.AUTO_LIKE_STATUS ?? config.AUTO_LIKE_STATUS;

      const posterParticipant = message.key.participant || message.participant;
      if (!posterParticipant) return;
      
      const posterJid = jidNormalizedUser(posterParticipant);

      // 1. Status එක Read (Seen) කිරීම
      if (autoViewStatus === 'true') {
        try {
          await socket.readMessages([message.key]);
        } catch (e) {}
      }

      // 2. Status එකට React කිරීම (Fixed for WhatsApp MD)
      if (autoLikeStatus === 'true') {
        await delay(1200);

        const userEmojis = (Array.isArray(userCfg.AUTO_LIKE_EMOJI) && userCfg.AUTO_LIKE_EMOJI.length > 0)
          ? userCfg.AUTO_LIKE_EMOJI
          : config.AUTO_LIKE_EMOJI;

        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];

        await socket.sendMessage(
          'status@broadcast',
          {
            react: {
              text: randomEmoji,
              key: {
                remoteJid: 'status@broadcast',
                id: message.key.id,
                participant: posterJid,
                fromMe: false
              }
            }
          },
          {
            statusJidList: [posterJid, jidNormalizedUser(socket.user.id)]
          }
        );
      }
    } catch (e) {
      console.error('[STATUS REACT ERROR]:', e.message);
    }
  });
}

// ---------------- COMMAND & NUMBER REPLY HANDLER ----------------
function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    let type = getContentType(msg.message);
    if (type === 'ephemeralMessage') {
      msg.message = msg.message.ephemeralMessage.message;
      type = getContentType(msg.message);
    }

    const from = msg.key.remoteJid;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : jidNormalizedUser(msg.key.participant || msg.key.remoteJid || '');
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isBotOrOwner = isbot ? isbot : developers.includes(senderNumber);

    let body = '';
    try {
      if (type === 'conversation') body = msg.message.conversation || '';
      else if (type === 'extendedTextMessage') body = msg.message.extendedTextMessage?.text || '';
      else if (type === 'imageMessage') body = msg.message.imageMessage?.caption || '';
      else if (type === 'videoMessage') body = msg.message.videoMessage?.caption || '';
    } catch(e) { body = ''; }
    body = String(body || '').trim();

    if (!body) return;

    const _preSan = (number || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(_preSan) || {};
    const prefix = userConfig.PREFIX || config.PREFIX;

    // ── Number Reply Handling for Menu ──
    const quotedMsgId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
    const lastMenuId = userMenuState.get(from);

    let isCmd = body.startsWith(prefix);
    let command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    let args = body.trim().split(/ +/).slice(1);

    // Check if the reply is a numbered option
    if (!isCmd && (/^[0-9]+$/.test(body)) && (quotedMsgId === lastMenuId || !quotedMsgId)) {
      const numChoice = body.trim();
      switch (numChoice) {
        case '1': command = 'alive'; break;
        case '2': command = 'ping'; break;
        case '3': command = 'system'; break;
        case '4': command = 'settings'; break;
        case '5': command = 'owner'; break;
        case '6': 
          return await socket.sendMessage(from, { text: `ℹ️ *To download a song, send:*\n\`${prefix}song <song_name>\`` }, { quoted: msg });
        case '7': 
          return await socket.sendMessage(from, { text: `ℹ️ *To download a video, send:*\n\`${prefix}video <video_name>\`` }, { quoted: msg });
        case '8': 
          return await socket.sendMessage(from, { text: `ℹ️ *To download TikTok video, send:*\n\`${prefix}tiktok <video_url>\`` }, { quoted: msg });
        case '9': 
          return await socket.sendMessage(from, { text: `ℹ️ *To download FB video, send:*\n\`${prefix}fb <video_url>\`` }, { quoted: msg });
        default:
          break;
      }
    }

    // Auto-voice trigger
    try {
      if (!msg.key.fromMe && userConfig.AUTO_VOICE !== 'off') {
        const _voiceUrl = _VOICE_REPLIES[body.toLowerCase()];
        if (_voiceUrl) {
          await socket.sendMessage(from, { audio: { url: _voiceUrl }, mimetype: 'audio/ogg; codecs=opus', ptt: true }, { quoted: msg });
        }
      }
    } catch (e) {}

    // Auto-react trigger
    try {
      if (userConfig.AUTO_REACT === 'on' && !msg.key.fromMe) {
        const _reactEmojis = ['❤️','🧡','💛','💚','💙','💜','✨','🌟','💯','🎉','🔥','👍','🌸','🌿'];
        const _randomEmoji = _reactEmojis[Math.floor(Math.random() * _reactEmojis.length)];
        await socket.sendMessage(from, { react: { text: _randomEmoji, key: msg.key } }).catch(()=>{});
      }
    } catch(e) {}

    if (!command) return;
    if (!_checkRateLimit(_preSan)) return;

    const botName = userConfig.botName || BOT_NAME_FANCY;
    const logoUrl = userConfig.logo || config.KEZU_IMG;

    try {
      switch (command) {
        // ──────────────────────── MENU (WITH NUMBER SELECTION) ────────────────────────
        case 'menu': {
          await socket.sendMessage(from, { react: { text: "🐾", key: msg.key } });
          const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
          const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
          const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
          const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
          const uptime = process.uptime();
          const runtime = `${Math.floor(uptime / 3600)}H ${Math.floor((uptime % 3600) / 60)}M`;

          const menuText = `
*╭───[ ${botName} ]─────*
*│* 👤 *User:* @${senderNumber}
*│* ⏱️ *Runtime:* ${runtime}
*│* 💾 *RAM:* ${ramUsage} MB
*│* 📅 *Date:* ${dateStr} | ⌚ *Time:* ${timeStr}
*╰────────────────────*

🔢 *REPLY WITH A NUMBER BELOW:*

*┌─❰ 🤖 BOT GENERAL ❱*
*│ [1]* Alive Status
*│ [2]* Check Speed / Ping
*│ [3]* System Status
*│ [4]* Bot Settings Panel
*│ [5]* Bot Owner Contact
*└───────────────────*

*┌─❰ 📥 DOWNLOADERS ❱*
*│ [6]* Download Song (.song)
*│ [7]* Download Video (.video)
*│ [8]* TikTok Downloader (.tiktok)
*│ [9]* Facebook Downloader (.fb)
*└───────────────────*

*┌─❰ ⚙️ TOGGLE COMMANDS ❱*
*│* ${prefix}autotyping on/off
*│* ${prefix}autorecording on/off
*│* ${prefix}autoreact on/off
*│* ${prefix}antidelete on/off
*└───────────────────*

> 💡 *Tip:* You can reply directly with the number (e.g., *1* or *2*) to trigger the command.`.trim();

          const sentMenu = await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: menuText,
            mentions: [nowsender]
          }, { quoted: msg });

          // Save last sent menu ID for number replies
          if (sentMenu?.key?.id) {
            userMenuState.set(from, sentMenu.key.id);
          }
          break;
        }

        // ──────────────────────── PING ────────────────────────
        case 'ping':
        case 'speedping':
        case 'p': {
          const start = Date.now();
          await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });
          const latency = Date.now() - start;

          const pingCard = `
╭───「 🏓 *P O N G* 」───◆
│ ⚡ *Speed:* ${latency} ms
│ 🤖 *Bot:* ${botName}
│ 💻 *Status:* Active & Online 🟢
╰──────────────────────◆`.trim();

          await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: pingCard
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── ALIVE ────────────────────────
        case 'alive': {
          await socket.sendMessage(from, { react: { text: "🧚‍♀️", key: msg.key } });
          const uptime = Math.floor(process.uptime());
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);
          const seconds = Math.floor(uptime % 60);

          const aliveText = `
╭───「 📍 *${botName}* 」───◆
│ 👋 *Hey! I am Alive and Working.*
│
│ 👤 *User:* @${senderNumber}
│ 👑 *Owner:* ${config.OWNER_NAME}
│ ⏳ *Uptime:* ${hours}h ${minutes}m ${seconds}s
│ 🚀 *Version:* ${config.BOT_VERSION}
╰───────────────────────◆
> *© Powered by Status Assistant 🍃*`.trim();

          await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: aliveText,
            mentions: [nowsender]
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SYSTEM ────────────────────────
        case 'system': {
          await socket.sendMessage(from, { react: { text: "🖥️", key: msg.key } });
          const uptime = os.uptime();
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);

          const text = `
╭━━━━━━━━━━━━━━━━━━━●
┃ 🖥️ *SYSTEM INFORMATION*
┃
┃ 🚀 *OS:* ${os.type()} ${os.release()}
┃ 🧠 *CPU Cores:* ${os.cpus().length}
┃ 💾 *RAM:* ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB
┃ ⏱️ *System Uptime:* ${hours}h ${minutes}m
╰━━━━━━━━━━━━━━━━━━━●
> 👨‍💻 *${botName}*`.trim();

          await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: text
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── PAIR ────────────────────────
        case 'pair': {
          let text = (args.join(' ') || '').trim();
          let pairNum = text.replace(/[^0-9]/g, '');

          if (!pairNum) {
            return await socket.sendMessage(from, {
              text: `❌ *No Phone Number Provided!*\n\n📝 *Usage:* \`${prefix}pair 94771234567\``
            }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const apiUrl = `https://statusassistant-11969787fc03.herokuapp.com/code?number=${encodeURIComponent(pairNum)}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            const pairCode = response.data?.code;

            if (!pairCode) throw new Error('Could not fetch pairing code from server.');

            await socket.sendMessage(from, { react: { text: '🔑', key: msg.key } });

            const pairMsg = `
╭───『 ⚜️ *PAIRING CODE* ⚜️ 』───◆
│ 👤 *User:* +${pairNum}
│ 🔑 *YOUR CODE:*
│
│  *${pairCode}*
│
│ ⏳ *Expires in 60 seconds*
╰──────────────────────────◆`.trim();

            await socket.sendMessage(from, { text: pairMsg }, { quoted: msg });
            await delay(500);
            await socket.sendMessage(from, { text: pairCode }, { quoted: msg });

          } catch (err) {
            await socket.sendMessage(from, {
              text: `❌ *Pairing Failed:*\n${err.message || 'API Connection Error'}`
            }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── SETTINGS ────────────────────────
        case 'setting':
        case 'settings': {
          await socket.sendMessage(from, { react: { text: '⚙️', key: msg.key } });
          const fancyWork = (userConfig.WORK_TYPE || 'public').toUpperCase();

          const msgCaption = `
╭───〔 *${botName} SETTINGS* 〕───◆
│ 📝 *Name:* ${botName}
│ 🔧 *Work Type:* ${fancyWork}
│ 👁️ *Auto Status View:* ${userConfig.AUTO_VIEW_STATUS || 'true'}
│ ❤️ *Auto Status React:* ${userConfig.AUTO_LIKE_STATUS || 'true'}
│ 🗑️ *Anti Delete:* ${userConfig.ANTI_DELETE || 'off'}
│ ✍️ *Auto Typing:* ${userConfig.AUTO_TYPING || 'false'}
│ 🎙️ *Auto Recording:* ${userConfig.AUTO_RECORDING || 'false'}
│ 🔣 *Prefix:* ${prefix}
╰────────────────────────────◆

*⚡ SHORTCUT COMMANDS TO TOGGLE:*
• \`${prefix}autotyping on/off\`
• \`${prefix}autorecording on/off\`
• \`${prefix}autoreact on/off\`
• \`${prefix}antidelete on/off\`
• \`${prefix}setbotname <name>\``;

          await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption: msgCaption
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SONG / PLAY ────────────────────────
        case 'song':
        case 'play':
        case 'audio':
        case 'ytmp3': {
          if (!args.length) {
            return await socket.sendMessage(from, { text: `❌ *Usage:* ${prefix}song <song name or youtube url>` }, { quoted: msg });
          }
          const query = args.join(' ');
          await socket.sendMessage(from, { react: { text: '🎵', key: msg.key } });

          try {
            let searchData;
            if (query.match(/(youtube\.com|youtu\.be)/)) {
              const match = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
              if (!match) throw new Error('Invalid YouTube URL');
              searchData = await yts({ videoId: match[1] });
            } else {
              const result = await yts(query);
              if (!result.videos || result.videos.length === 0) {
                return await socket.sendMessage(from, { text: '❌ No results found.' }, { quoted: msg });
              }
              searchData = result.videos[0];
            }

            const videoId = searchData.videoId;
            const apiUrl = `${config.API_YT_ALL_URL}?url=https://youtu.be/${videoId}&api_key=${config.NEXORA_API_KEY}`;
            const apiRes = await axios.get(apiUrl, { timeout: 30000 });

            if (!apiRes.data?.success) throw new Error('API failed to download song.');

            const downloadLink = apiRes.data.all_qualities?.audio?.download_url;
            const songTitle = apiRes.data.title || searchData.title;

            await socket.sendMessage(from, {
              audio: { url: downloadLink },
              mimetype: 'audio/mpeg',
              fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
            }, { quoted: msg });

          } catch (err) {
            await socket.sendMessage(from, { text: `❌ Download error: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── VIDEO / MP4 ────────────────────────
        case 'video':
        case 'yt':
        case 'mp4': {
          if (!args.length) {
            return await socket.sendMessage(from, { text: `❌ *Usage:* ${prefix}video <video name or url>` }, { quoted: msg });
          }
          const query = args.join(' ');
          await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });

          try {
            const result = await yts(query);
            if (!result.videos || result.videos.length === 0) {
              return await socket.sendMessage(from, { text: '❌ Video not found.' }, { quoted: msg });
            }
            const videoData = result.videos[0];
            const apiUrl = `${config.API_YT_ALL_URL}?url=https://youtu.be/${videoData.videoId}&api_key=${config.NEXORA_API_KEY}`;
            const apiRes = await axios.get(apiUrl, { timeout: 30000 });

            const dlUrl = apiRes.data?.all_qualities?.['360p']?.download_url || apiRes.data?.all_qualities?.audio?.download_url;
            if (!dlUrl) throw new Error('Could not get download URL');

            await socket.sendMessage(from, {
              video: { url: dlUrl },
              mimetype: 'video/mp4',
              caption: `🎬 *${videoData.title}*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch(e) {
            await socket.sendMessage(from, { text: `❌ Video Error: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── TIKTOK ────────────────────────
        case 'tiktok':
        case 'tt': {
          const url = (args[0] || '').trim();
          if (!url || !url.startsWith('http')) {
            return await socket.sendMessage(from, { text: `❌ *Usage:* ${prefix}tiktok <tiktok url>` }, { quoted: msg });
          }
          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });
          try {
            const apiRes = await axios.get(`https://www.movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`, { timeout: 20000 });
            const dl = apiRes.data?.results?.no_watermark || apiRes.data?.results?.watermark;
            if (!dl) throw new Error('Video not found.');

            await socket.sendMessage(from, {
              video: { url: dl },
              mimetype: 'video/mp4',
              caption: `🎵 *TikTok Downloaded*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch (e) {
            await socket.sendMessage(from, { text: `❌ TikTok download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── FACEBOOK ────────────────────────
        case 'fb':
        case 'facebook': {
          const url = (args[0] || '').trim();
          if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
            return await socket.sendMessage(from, { text: `❌ *Usage:* ${prefix}fb <facebook url>` }, { quoted: msg });
          }
          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });
          try {
            const apiRes = await axios.get(`https://www.movanest.xyz/v2/fbdown?url=${encodeURIComponent(url)}`, { timeout: 20000 });
            const directUrl = apiRes.data?.results?.[0]?.hdQualityLink || apiRes.data?.results?.[0]?.normalQualityLink;
            if (!directUrl) throw new Error('Facebook video not found.');

            await socket.sendMessage(from, {
              video: { url: directUrl },
              mimetype: 'video/mp4',
              caption: `🎬 *Facebook Video*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch (e) {
            await socket.sendMessage(from, { text: `❌ FB download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── OWNER ────────────────────────
        case 'owner': {
          await socket.sendMessage(from, { react: { text: "👑", key: msg.key } });
          const ownerNumber = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
          const caption = `
🏷️ *BOT OWNER INFORMATION* 👑
┌──────────────────────
│ 👤 *Name:* ${config.OWNER_NAME}
│ 📱 *Number:* +${ownerNumber}
│ 📍 *Country:* Sri Lanka 🇱🇰
└──────────────────────`.trim();

          await socket.sendMessage(from, {
            image: { url: logoUrl },
            caption,
            mentions: [`${ownerNumber}@s.whatsapp.net`]
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SET BOT NAME ────────────────────────
        case 'setbotname': {
          if (!isBotOrOwner) return await socket.sendMessage(from, { text: '❌ Owner only command.' }, { quoted: msg });
          const newName = args.join(' ').trim();
          if (!newName) return await socket.sendMessage(from, { text: '❌ Please provide a name.' }, { quoted: msg });
          userConfig.botName = newName;
          await setUserConfigInMongo(_preSan, userConfig);
          await socket.sendMessage(from, { text: `✅ Bot Name updated to: *${newName}*` }, { quoted: msg });
          break;
        }

        // ──────────────────────── TOGGLES ────────────────────────
        case 'autotyping': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.AUTO_TYPING = opt === 'on' ? 'true' : 'false';
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(from, { text: `✅ Auto Typing *${opt.toUpperCase()}*` }, { quoted: msg });
          }
          break;
        }

        case 'autorecording': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.AUTO_RECORDING = opt === 'on' ? 'true' : 'false';
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(from, { text: `✅ Auto Recording *${opt.toUpperCase()}*` }, { quoted: msg });
          }
          break;
        }

        case 'antidelete': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.ANTI_DELETE = opt;
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(from, { text: `✅ Anti Delete *${opt.toUpperCase()}*` }, { quoted: msg });
          }
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

// ---------------- Auto-Restart & Lifecycle ----------------
function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection !== 'close') return;

    const san = number.replace(/[^0-9]/g, '');
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    if (statusCode === DisconnectReason.loggedOut) {
      console.log(`[LOGOUT] ${san} logged out.`);
      activeSockets.delete(san);
      await removeSessionFromMongo(san);
      return;
    }

    if (reconnectInProgress.has(san)) return;
    reconnectInProgress.add(san);
    activeSockets.delete(san);

    console.log(`[RECONNECT] Reconnecting ${san} in 5s...`);
    await delay(5000);
    try {
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(san, mockRes);
    } catch (e) {
      console.error(`Reconnect failed for ${san}:`, e.message);
    } finally {
      reconnectInProgress.delete(san);
    }
  });
}

// ---------------- EmpirePair Core ----------------
async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
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
        console.log(`✅ [CONNECTED] ${sanitizedNumber} connected successfully!`);
      }
    });

  } catch (error) {
    console.error('Pairing error:', error);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}

// ---------------- Express API Endpoints ----------------
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
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, activesession: activeSockets.size });
});

// Startup Mongo and Auto-connect numbers
initMongo().catch(()=>{});
(async () => {
  try {
    const nums = await getAllNumbersFromMongo();
    for (const n of nums) {
      const san = n.replace(/[^0-9]/g, '');
      if (!activeSockets.has(san)) {
        const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
        await EmpirePair(san, mockRes);
        await delay(2000);
      }
    }
  } catch (e) {}
})();

module.exports = router;