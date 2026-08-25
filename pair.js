// ====================================================
// 𝘒𝘌𝘡𝘜 𝘕𝘌𝘞 𝘔𝘖𝘝𝘐𝘌 𝘉𝘖𝘛 𝘊𝘈𝘚𝘌 𝘊𝘖𝘓𝘓𝘌𝘊𝘛𝘐𝘖𝘕 (#𝘗𝘙𝘖𝘍𝘐𝘟 ) 𝘈𝘐
// ====================================================

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
const yt = require('@vreden/youtube_scraper');
const { getFbVideoInfo } = require('fb-downloader-scrapper');
const getFBInfo = require('@xaviabot/fb-downloader');
const TiktokDL = require('@tobyg74/tiktok-api-dl');
const Pinterest = require('@myno_21/pinterest-scraper');
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
  AUTO_LIKE_EMOJI: ['🌸','🪻','🌷'],
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94789088223',
  OWNER_NAME: '𝐊ᴇᴢᴜ𝚄 🪻||𝑺𝒂𝒌𝒖𝒓𝒂̷🌸⃘̬ٜٜٜ͠',
  NEWSLETTER_JID: '120363144038483540@newsletter',
  NEWSLETTER_NAME: '𝑺͟𝒂͠𝒌͠𝒖͠𝒓̷𝒂͠ Official 🌸',
  DEFAULT_LOGO: 'https://i.ibb.co/S4K5YgGW/file-00000000c4e8821185b5e53887493382.png',
  BOT_FOOTER: '> *ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝑺͟𝒂͠𝒌͠𝒖͠𝒓̷𝒂͠🌸⃘̬ٜٜٜ͠*',
  API_YT_ALL_URL: 'https://nexoraapi.laksidunimsara.com/api/youtube/all',
  NEXORA_API_KEY: 'lakiya_46d6ceb9bed1f0de0181c9d6c91cbe05bdba0bb16d3498b46a61f118f4b40f37',
  API_MAIN_URL1: 'https://chama-movie-api.koyeb.app/',
  API_KEY_1:'chama_api_7f4ac9c10c749bcedbd4437a066009a2',
  MOVIE_FOOTER:"© 𝒔𝒂𝒌𝒖𝒓𝒂 𝒎𝒐𝒗𝒊𝒆 𝒉𝒖𝒃. 🌸",
  BOT_VERSION: 'PRO'
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
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    await numbersCol.deleteOne({ number: sanitized });
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
const userMenuState = new Map(); // Stores { id: msgId, timestamp: Date.now() }
const messageStore = new Map();
const pendingInactivityTimers = new Map();

// ──────────────── SESSION CLEANUP HELPER ────────────────────────
async function deleteEntireSession(sanitizedNumber) {
  try {
    const san = sanitizedNumber.replace(/[^0-9]/g, '');
    
    if (pendingInactivityTimers.has(san)) {
      clearTimeout(pendingInactivityTimers.get(san));
      pendingInactivityTimers.delete(san);
    }

    if (activeSockets.has(san)) {
      try {
        const sock = activeSockets.get(san);
        sock.ev.removeAllListeners('connection.update');
        sock.ev.removeAllListeners('messages.upsert');
        sock.ev.removeAllListeners('creds.update');
        sock.ws?.close();
      } catch(e) {}
      activeSockets.delete(san);
    }
    await removeSessionFromMongo(san);
    const sessionPath = path.join(os.tmpdir(), `sakura_session_${san}`);
    if (fs.existsSync(sessionPath)) {
      await fs.remove(sessionPath).catch(() => {});
    }
    console.log(`🗑️ [Sakura DB] Complete session purged for +${san}`);
  } catch(e) {
    console.error('deleteEntireSession error:', e);
  }
}

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
    if (msg.key.participant === botJid) return;

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

      if (autoView === 'true') {
        try {
          await socket.readMessages([msg.key]);
        } catch (error) {
          console.warn('⚠️ Failed to read status:', error.message);
        }
      }

      if (autoLike === 'true') {
        const emojis = userCfg.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI;
        const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)] || '🌸';

        try {
          await socket.sendMessage(
            msg.key.remoteJid,
            { react: { text: randomEmoji, key: msg.key } },
            { statusJidList: [msg.key.participant] }
          );
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

    const masterOwners = config.OWNER_NUMBER.split(',').map(v => v.replace(/[^0-9]/g, ''));
    const isMasterOwner = masterOwners.includes(senderNumber);

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
    let isCmd = body.startsWith(prefix);
    let command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    let args = body.trim().split(/ +/).slice(1);

    // ────────────── SMART CONFLICT-FREE NUMBER SELECTION ──────────────
    if (!isCmd && /^[0-9]+$/.test(body)) {
      const choice = body.trim();
      const movieSes = global.movieSessions?.[from];
      const pinSes = global.pinSessions?.[from];
      const menuSes = userMenuState.get(from);

      const isMovieValid = movieSes && (Date.now() - movieSes.timestamp < 5 * 60 * 1000);
      const isPinValid = pinSes && (Date.now() - pinSes.timestamp < 5 * 60 * 1000);
      const isMenuValid = menuSes && (Date.now() - (menuSes.timestamp || 0) < 5 * 60 * 1000);

      let targetAction = null;

      // 1. Quoted check (Exact Reply Priority)
      if (quotedMsgId) {
        if (isMovieValid && movieSes.messageId === quotedMsgId) {
          targetAction = 'movie';
        } else if (isPinValid && pinSes.messageId === quotedMsgId) {
          targetAction = 'pin';
        } else if (isMenuValid && menuSes.id === quotedMsgId) {
          targetAction = 'menu';
        }
      }

      // 2. Non-quoted check (Latest Timestamp Priority)
      if (!targetAction) {
        const candidates = [];
        if (isMovieValid) candidates.push({ type: 'movie', time: movieSes.timestamp });
        if (isPinValid) candidates.push({ type: 'pin', time: pinSes.timestamp });
        if (isMenuValid) candidates.push({ type: 'menu', time: menuSes.timestamp });

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.time - a.time);
          targetAction = candidates[0].type;
        }
      }

      // Route according to matched action
      if (targetAction === 'movie') {
        command = 'movie';
        args = [choice];
      } else if (targetAction === 'pin') {
        command = 'pin';
        args = [choice];
      } else if (targetAction === 'menu') {
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
    }

    if (!command) return;

    try {
      switch (command) {
// ====================================================
// 𝘒𝘌𝘡𝘜 𝘕𝘌𝘞 𝘔𝘖𝘝𝘐𝘌 𝘉𝘖𝘛 𝘊𝘈𝘚𝘌 𝘊𝘖𝘓𝘓𝘌𝘊𝘛𝘐𝘖𝘕 (#𝘗𝘙𝘖𝘍𝘐𝘟 ) 𝘈𝘐
          // ────────────────── CHANNEL ID & INFO ──────────────────
        case 'cid':
        case 'channelid': {
          await socket.sendMessage(from, { react: { text: '📢', key: msg.key } });

          try {
            const input = args.join(' ').trim();
            let targetJid = null;
            let inviteCode = null;

            // 1. Quoted forwarded newsletter check
            const quotedCtx = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.contextInfo ||
                              msg.message?.extendedTextMessage?.contextInfo;
            const forwardedNewsletter = quotedCtx?.forwardedNewsletterMessageInfo;

            // 2. Extract invite code from WhatsApp channel link
            const channelLinkMatch = input.match(/whatsapp\.com\/channel\/([0-9A-Za-z]+)/i);

            if (channelLinkMatch) {
              inviteCode = channelLinkMatch[1];
            } else if (input.endsWith('@newsletter')) {
              targetJid = input;
            } else if (forwardedNewsletter?.newsletterJid) {
              targetJid = forwardedNewsletter.newsletterJid;
            } else if (from.endsWith('@newsletter')) {
              targetJid = from;
            }

            let metadata = null;

            if (inviteCode) {
              metadata = await socket.newsletterMetadata('invite', inviteCode);
            } else if (targetJid) {
              metadata = await socket.newsletterMetadata('jid', targetJid);
            } else {
              return await socket.sendMessage(from, {
                text: `╭───〔 📢 *CHANNEL ID / INFO* 〕───⊷\n│ ⚠️ *භාවිතය:*\n│ • \`${prefix}cid <Channel Link>\`\n│ • \`${prefix}cid <Channel JID>\`\n│ • Channel එක ඇතුලෙදි \`${prefix}cid\`\n│ • Channel post එකකට Reply කර \`${prefix}cid\`\n│\n│ 💡 *Ex:* \`${prefix}cid https://whatsapp.com/channel/0029Va...\`\n╰──────────────────────────⊷`
              }, { quoted: msg });
            }

            if (!metadata) {
              return await socket.sendMessage(from, { 
                text: '❌ Channel විස්තර ලබාගැනීමට නොහැකි විය. කරුණාකර Link එක හෝ JID එක නිවැරදි දැයි පරීක්ෂා කරන්න.' 
              }, { quoted: msg });
            }

            const chId = metadata.id || targetJid || 'N/A';
            const chName = metadata.name || metadata.thread_metadata?.name?.text || 'Unknown Channel';
            const chSubs = metadata.subscribers || metadata.subscribers_count || metadata.thread_metadata?.subscribers_count || 'N/A';
            const chDesc = metadata.description || metadata.thread_metadata?.description?.text || 'No description';
            const chRole = metadata.viewer_metadata?.role || 'VIEWER';
            const chCreation = metadata.creation_time ? moment(metadata.creation_time * 1000).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'N/A';
            
            // Profile Picture
            let ppUrl = null;
            try {
              if (metadata.picture || metadata.thread_metadata?.picture?.direct_path) {
                ppUrl = await socket.profilePictureUrl(chId, 'image');
              }
            } catch (e) {
              ppUrl = null;
            }

            const infoText = `〔 📢 *CHANNEL DETAILS* 〕
            
│ 🏷️ *Name:* ${chName}
│ 🆔 *JID:* \`${chId}\`
│ 👥 *Followers:* ${chSubs}
│ 👑 *Your Role:* ${chRole}
│ 📅 *Created:* ${chCreation}
│ 📝 *About:* ${chDesc}

${botFooter}`;

            if (ppUrl) {
              await sendFancyMsg(socket, from, {
                image: { url: ppUrl },
                caption: infoText
              }, msg, userCfg);
            } else {
              await sendFancyMsg(socket, from, {
                text: infoText
              }, msg, userCfg);
            }

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('CID Command Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ *දෝෂයක් සිදු විය:* ${err.message}` }, { quoted: msg });
          }
          break;
        }
case 'gjid':
        case 'getjid':
        case 'groupjid': {
          await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });

          try {
            const input = args.join(' ').trim().toLowerCase();

            // 1. Bot සිටින සියලුම Groups වල JIDs ලබා ගැනීමට (උදා: .gjid all)
            if (input === 'all' || input === 'list') {
              const getGroups = await socket.groupFetchAllParticipating();
              const groups = Object.values(getGroups);

              // strictly filter only @g.us (exclude @lid / others)
              const validGroups = groups.filter(g => g.id && g.id.endsWith('@g.us') && !g.id.includes('@lid'));

              if (validGroups.length === 0) {
                await socket.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
                return await socket.sendMessage(from, { text: '⚠️ කිසිදු Group එකක් හමු නොවීය.' }, { quoted: msg });
              }

              let responseText = `╭───────────────━⊷\n│ 👥 *ALL GROUP JIDs (${validGroups.length})*\n╰───────────────━⊷\n\n`;

              validGroups.forEach((g, index) => {
                responseText += `🔹 *${index + 1}. ${g.subject}*\n`;
                responseText += `   📍 *JID:* \`${g.id}\`\n\n`;
              });

              await socket.sendMessage(from, { text: responseText.trim() }, { quoted: msg });
              await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
              break;
            }

            // 2. අදාළ Group එකේ JID එක පමණක් ලබා ගැනීමට (Group එක තුළදී)
            if (from.endsWith('@g.us') && !from.includes('@lid')) {
              let groupName = 'Group';
              try {
                const metadata = await socket.groupMetadata(from);
                groupName = metadata.subject;
              } catch (e) {
                // Metadata ලබාගැනීමට නොහැකි වුවහොත් default නම යොදයි
              }

              const responseText = `╭───────────────━⊷\n│ 👥 *GROUP JID INFO*\n╰───────────────━⊷\n│ 🏷️ *නම:* ${groupName}\n│ 📍 *JID:* \`${from}\`\n╰───────────────━⊷\n\n💡 _සියලුම Groups වල JID ලබා ගැනීමට \`${prefix}gjid all\` භාවිතා කරන්න._`;

              await socket.sendMessage(from, { text: responseText }, { quoted: msg });
              await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } else {
              // Inbox එකකදී .gjid ගැහුවොත්
              await socket.sendMessage(from, { react: { text: '⚠️', key: msg.key } });
              await socket.sendMessage(from, { 
                text: `╭───────────────━⊷\n│ ⚠️ *මෙය Group එකක් නොවේ!*\n│\n│ 🔹 Group එකක JID එක ගැනීමට Group එක තුළ \`${prefix}gjid\` යොදන්න.\n│ 🔹 සියලුම Groups වල JID ගැනීමට \`${prefix}gjid all\` යොදන්න.\n╰───────────────━⊷` 
              }, { quoted: msg });
            }

          } catch (err) {
            console.error('GJID Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ JID ලබාගැනීම අසාර්ථක විය: ${err.message}` }, { quoted: msg });
          }
          break;
        }
// ====================================================
case 'jsend':
case 'sendjid': {
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

  if (!quoted) {
    return await socket.sendMessage(from, { 
      text: `╭───────────────━⊷\n│ ⚠️ *Usage:* Reply to any message/media with:\n│ 🔹 \`${prefix}jsend <Target JID(s)>\`\n│\n│ 📌 *Examples:*\n│ • Group: \`${prefix}jsend 12036302482394@g.us\`\n│ • Channel: \`${prefix}jsend 12036302482394@newsletter\`\n│ • User: \`${prefix}jsend 94771234567@s.whatsapp.net\`\n│ • LID: \`${prefix}jsend 12345678901234@lid\`\n│\n│ 💡 _Separate multiple JIDs using commas (,)._\n╰───────────────━⊷` 
    }, { quoted: msg });
  }

  const input = args.join(' ').trim();
  if (!input && (!ctxInfo?.mentionedJid || ctxInfo.mentionedJid.length === 0)) {
    return await socket.sendMessage(from, { 
      text: `❌ Please provide a target JID!\nExample: \`${prefix}jsend 12036302482394@g.us\`` 
    }, { quoted: msg });
  }

  await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });

  try {
    let targetJids = [];

    // Extract mentioned JIDs if available
    if (ctxInfo?.mentionedJid && ctxInfo.mentionedJid.length > 0) {
      targetJids.push(...ctxInfo.mentionedJid);
    }

    // Parse and normalize input targets
    if (input) {
      const rawList = input.split(/[\s,]+/);
      for (let item of rawList) {
        let cleanItem = item.trim();
        if (!cleanItem) continue;

        // Convert legacy @us or @c.us to @s.whatsapp.net
        if (cleanItem.endsWith('@us')) {
          cleanItem = cleanItem.replace(/@us$/, '@s.whatsapp.net');
        } else if (cleanItem.endsWith('@c.us')) {
          cleanItem = cleanItem.replace(/@c.us$/, '@s.whatsapp.net');
        }

        // Validate standard JID formats
        if (
          cleanItem.endsWith('@s.whatsapp.net') ||
          cleanItem.endsWith('@g.us') ||
          cleanItem.endsWith('@newsletter') ||
          cleanItem.endsWith('@lid')
        ) {
          targetJids.push(cleanItem);
        } else {
          // Auto-detect format if raw number/ID was passed
          const cleanNum = cleanItem.replace(/[^0-9-]/g, '');
          if (cleanNum.includes('-') || cleanNum.length > 15) {
            targetJids.push(`${cleanNum}@g.us`);
          } else if (cleanNum.length >= 7) {
            targetJids.push(`${cleanNum}@s.whatsapp.net`);
          }
        }
      }
    }

    // Remove duplicate targets
    targetJids = [...new Set(targetJids)];

    if (targetJids.length === 0) {
      await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
      return await socket.sendMessage(from, { text: `❌ No valid JID found!` }, { quoted: msg });
    }

    // Unwrap nested message wrappers (ViewOnce, Ephemeral, Documents, etc.)
    let cleanQuoted = quoted;
    if (cleanQuoted.ephemeralMessage) cleanQuoted = cleanQuoted.ephemeralMessage.message;
    if (cleanQuoted.viewOnceMessageV2) cleanQuoted = cleanQuoted.viewOnceMessageV2.message;
    if (cleanQuoted.viewOnceMessage) cleanQuoted = cleanQuoted.viewOnceMessage.message;
    if (cleanQuoted.documentWithCaptionMessage) cleanQuoted = cleanQuoted.documentWithCaptionMessage.message;

    const fwdContext = {
      ...(typeof getForwardedContext === 'function' ? getForwardedContext(userCfg) : {}),
      forwardingScore: 9999,
      isForwarded: true
    };

    let successCount = 0;
    let failedCount = 0;

    // Send forward payload to all targets
    for (const target of targetJids) {
      try {
        await socket.sendMessage(target, {
          forward: {
            key: {
              remoteJid: from,
              id: ctxInfo?.stanzaId || msg.key.id,
              fromMe: !ctxInfo?.participant,
              participant: ctxInfo?.participant || undefined
            },
            message: cleanQuoted
          },
          contextInfo: fwdContext
        });
        successCount++;
      } catch (sendErr) {
        console.error(`Failed to forward to ${target}:`, sendErr);
        failedCount++;
      }
    }

    // Success / Failure reactions
    if (successCount > 0) {
      await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
    } else {
      await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
      await socket.sendMessage(from, { 
        text: `❌ Forwarding failed for all target JIDs.` 
      }, { quoted: msg });
    }

  } catch (err) {
    console.error('JSend Error:', err);
    await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
    await socket.sendMessage(from, { text: `❌ Error: ${err.message}` }, { quoted: msg });
  }
  break;
}
          // ────────────────── RENAME DOCUMENT / FILE ──────────────────
        case 'rename':
        case 'rn':
        case 'renamefile': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          let newName = args.join(' ').trim();

          if (!quoted) {
            return await socket.sendMessage(from, {
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:*\n│ ඕනෑම Document එකකට/File එකකට Reply කර:\n│ 🔹 \`${prefix}rename <අලුත් නම>\`\n│\n│ 📝 *Ex:* \`${prefix}rename Episode 01.mkv\`\n╰───────────────━⊷`
            }, { quoted: msg });
          }

          if (!newName) {
            return await socket.sendMessage(from, {
              text: `❌ කරුණාකර file එක සඳහා ලබාදෙන අලුත් නම ඇතුළත් කරන්න.\n*Ex:* \`${prefix}rename Sample Document.pdf\``
            }, { quoted: msg });
          }

          let cleanQuoted = quoted;
          if (cleanQuoted.ephemeralMessage) cleanQuoted = cleanQuoted.ephemeralMessage.message;
          if (cleanQuoted.viewOnceMessageV2) cleanQuoted = cleanQuoted.viewOnceMessageV2.message;
          if (cleanQuoted.viewOnceMessage) cleanQuoted = cleanQuoted.viewOnceMessage.message;

          const targetDoc = cleanQuoted.documentWithCaptionMessage?.message?.documentMessage 
            || cleanQuoted.documentMessage 
            || cleanQuoted.videoMessage 
            || cleanQuoted.audioMessage 
            || cleanQuoted.imageMessage;

          if (!targetDoc) {
            return await socket.sendMessage(from, {
              text: '❌ කරුණාකර වලංගු Document එකකට හෝ File එකකට Reply කරන්න.'
            }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const origFileName = targetDoc.fileName || '';
            const mimetype = targetDoc.mimetype || 'application/octet-stream';

            // Original extension එක ලබාගැනීම (නැතහොත් mime type එකෙන් ලබාගැනීම)
            let origExt = '';
            if (origFileName && origFileName.includes('.')) {
              origExt = '.' + origFileName.split('.').pop();
            }

            // User අලුත් නමට extension එකක් නොදුන්නේ නම් original extension එක එකතු කිරීම
            if (origExt && !newName.toLowerCase().endsWith(origExt.toLowerCase()) && !newName.includes('.')) {
              newName += origExt;
            }

            // File name එකේ තිබිය නොහැකි සංකේත ඉවත් කිරීම
            const cleanFileName = newName.replace(/[\\/:*?"<>|]/g, '');

            const buffer = await downloadMediaMessage(cleanQuoted);

            if (!buffer || buffer.length === 0) {
              throw new Error('File එක Download කරගැනීමට නොහැකි විය.');
            }

            await socket.sendMessage(from, {
              document: buffer,
              mimetype: mimetype,
              fileName: cleanFileName,
              caption: `📄 *Renamed File:* \`${cleanFileName}\`\n\n${botFooter}`
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('Rename Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ *Rename Error:* ${err.message}` }, { quoted: msg });
          }
          break;
        }
        // ====================================================
        // 🎬 MOVIE SEARCH & DOWNLOADER (KEZU / CHAMA API)
        // ====================================================
        case 'movie':
        case 'm': {
          const input = args.join(' ').trim();
          const SESSION_TIMEOUT = 5 * 60 * 1000;
          const API_BASE = config.API_MAIN_URL1 ? config.API_MAIN_URL1.replace(/\/$/, '') : 'https://chama-movie-api-new.koyeb.app';
          const API_KEY = config.API_KEY_1 || 'chama_api_7f4ac9c10c749bcedbd4437a066009a2';

          if (!input) {
            return await socket.sendMessage(from, {
              text: `╭───〔 🎬 *MOVIE DOWNLOADER* 〕───⊷\n│ ⚠️ *help:*\n│ • \`${prefix}movie <name>\` (to search)\n│ • \`1, 2, 3...\` (reply a number)\n│\n│ 💡 *Ex:* \`${prefix}movie avatar\`\n╰──────────────────────────⊷`
            }, { quoted: msg });
          }

          if (!global.movieSessions) global.movieSessions = {};
          const session = global.movieSessions[from];

          const selectedNum = parseInt(input);
          const isSelection = !isNaN(selectedNum) && String(selectedNum) === input;

          // ─────────── STEP 2 & 3: NUMBER SELECTION ───────────
          if (isSelection && session) {
            const elapsed = Date.now() - session.timestamp;
            if (elapsed > SESSION_TIMEOUT) {
              delete global.movieSessions[from];
              return await socket.sendMessage(from, { 
                text: `⌛ *Session එක Expire වී ඇත.* කරුණාකර නැවත \`${prefix}movie <නම>\` ලෙස search කරන්න.` 
              }, { quoted: msg });
            }

            // ── STEP 2: MOVIE ITEM SELECTION ──
            if (session.step === 'SELECT_MOVIE') {
              const choice = selectedNum - 1;
              if (choice < 0 || choice >= session.results.length) {
                return await socket.sendMessage(from, { 
                  text: `❌ කරුණාකර 1 සිට ${session.results.length} අතර වලංගු අංකයක් ලබා දෙන්න.` 
                }, { quoted: msg });
              }

              const selectedItem = session.results[choice];
              const site = selectedItem.site;

              await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

              try {
                const infoEndpoint = site === 'moviebox' ? 'info' : 'infodl';
                const detailsUrl = `${API_BASE}/api/v1/movie/${site}/${infoEndpoint}?q=${encodeURIComponent(selectedItem.link)}&api_key=${API_KEY}`;
                const detailsResponse = await axios.get(detailsUrl, { timeout: 30000 });
                const movieInfo = detailsResponse.data?.data || {};
                const validDownloads = movieInfo.downloads || [];

                if (!validDownloads.length) {
                  return await socket.sendMessage(from, { 
                    text: `❌ *No direct downloads found for this title!*\nවෙනත් source එකකින් තෝරා බලන්න.` 
                  }, { quoted: msg });
                }

                const posterUrl = movieInfo.image || selectedItem.image || config.DEFAULT_LOGO;
                let movieDetailsText = `╭───〔 🎬 *${(botName || 'MOVIE BOT').toUpperCase()} DETAILS* 〕───⊷\n`;
                movieDetailsText += `│ 🎬 *Title:* ${movieInfo.title || selectedItem.title}\n`;
                movieDetailsText += `│ ⭐ *IMDB:* ★ ${movieInfo.imdb || movieInfo.rating || 'N/A'}\n`;
                movieDetailsText += `│ 📅 *Year:* ${movieInfo.year || 'N/A'}\n`;
                movieDetailsText += `│ ⏳ *Duration:* ${movieInfo.duration || 'N/A'}\n`;
                movieDetailsText += `│ 🎭 *Genres:* ${Array.isArray(movieInfo.genres) ? movieInfo.genres.join(', ') : (movieInfo.genres || 'N/A')}\n`;
                movieDetailsText += `│ 🗿 *Source:* ${site.toUpperCase()}\n`;
                movieDetailsText += `╰──────────────────────────⊷\n\n`;
                movieDetailsText += `*👇 SELECT QUALITY NUMBER 👇*\n\n`;

                validDownloads.forEach((dl, i) => {
                  const num = (i + 1) < 10 ? `0${i + 1}` : `${i + 1}`;
                  movieDetailsText += `*${num}* ➜ 💎 _${dl.quality || dl.name || 'HD'}_ 💾 _${dl.size || 'N/A'}_\n`;
                });

                movieDetailsText += `\n> 💡 *Download කිරීමට අංකය පමණක් Reply කරන්න (උදා: 1)*`;
                movieDetailsText += `\n${botFooter}`;

                const sentQualityMsg = await socket.sendMessage(from, {
                  image: { url: posterUrl },
                  caption: movieDetailsText
                }, { quoted: msg });

                global.movieSessions[from] = {
                  step: 'SELECT_QUALITY',
                  movieInfo,
                  selectedItem,
                  downloads: validDownloads,
                  messageId: sentQualityMsg?.key?.id,
                  timestamp: Date.now()
                };

              } catch (err) {
                console.error('Movie Info Error:', err);
                await socket.sendMessage(from, { 
                  text: `❌ *විස්තර ලබාගැනීමේදී දෝෂයක් සිදු විය:* ${err.message}` 
                }, { quoted: msg });
              }
              return;
            }

            // ── STEP 3: QUALITY SELECTION & DOWNLOAD ──
            if (session.step === 'SELECT_QUALITY') {
              const qChoice = selectedNum - 1;
              if (qChoice < 0 || qChoice >= session.downloads.length) {
                return await socket.sendMessage(from, { 
                  text: `❌ කරුණාකර 1 සිට ${session.downloads.length} අතර quality අංකයක් ලබා දෙන්න.` 
                }, { quoted: msg });
              }

              const selectedDl = session.downloads[qChoice];
              const movieInfo = session.movieInfo || {};
              const title = movieInfo.title || session.selectedItem?.title || 'Movie';
              const dlQuality = selectedDl.quality || selectedDl.name || 'HD';
              const cleanFileName = `${title.replace(/[\\/:*?"<>|]/g, '')} (${dlQuality}).mp4`;

              await socket.sendMessage(from, { react: { text: '📤', key: msg.key } });
              await socket.sendMessage(from, { 
                text: `🎬 *Downloading & Uploading:* _${title} (${dlQuality})_...\n⏳ කරුණාකර රැඳී සිටින්න.` 
              }, { quoted: msg });

              try {
                await socket.sendMessage(from, {
                  document: { url: selectedDl.link },
                  mimetype: 'video/mp4',
                  fileName: cleanFileName,
                  caption: `🎬 *${title}*\n📊 *Quality:* ${dlQuality}\n${botFooter}`
                }, { quoted: msg });

                await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
              } catch (e) {
                await socket.sendMessage(from, { 
                  text: `⚠️ *File එක විශාල නිසා WhatsApp මඟින් direct upload කළ නොහැක.*\n\n📌 *Direct Download Link:*\n${selectedDl.link}\n\n${botFooter}` 
                }, { quoted: msg });
              }

              delete global.movieSessions[from];
              return;
            }
          }

          // ─────────── STEP 1: INITIAL MOVIE SEARCH ───────────
          const query = input;
          await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });
          await socket.sendMessage(from, { text: `🔍 *Searching across all Movie Sources for:* _${query}_...` }, { quoted: msg });

          const sites = ["cinesubz", "sinhalasub", "thenkiri", "moviesublk", "baiscope", "cineru"];
          const promises = sites.map(site =>
            axios.get(`${API_BASE}/api/v1/movie/${site}/search?q=${encodeURIComponent(query)}&api_key=${API_KEY}`, { timeout: 15000 })
              .then(res => (res.data?.status && Array.isArray(res.data?.data)) ? res.data.data.map(item => ({ ...item, site })) : [])
              .catch(() => [])
          );

          const resultsArrays = await Promise.all(promises);
          let results = [];
          const maxLen = Math.max(...resultsArrays.map(arr => arr.length), 0);
          for (let i = 0; i < maxLen; i++) {
            for (const arr of resultsArrays) {
              if (i < arr.length) results.push(arr[i]);
            }
          }

          if (results.length === 0) {
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            return await socket.sendMessage(from, { text: `😞 *No movie results found for:* _${query}_` }, { quoted: msg });
          }

          let listText = `╭───〔 🍿 *${(botName || 'MOVIE BOT').toUpperCase()} SEARCH* 🍿 〕───⊷\n`;
          listText += `│ 🎯 *Query:* _${query}_\n`;
          listText += `│ 📊 *Results:* _${results.length} Items_\n`;
          listText += `╰──────────────────────────⊷\n\n`;
          listText += `*👇 SELECT A MOVIE NUMBER 👇*\n\n`;

          results.forEach((item, index) => {
            const siteTag = item.site ? item.site.toUpperCase() : 'SITE';
            const typeIcon = item.type === 'tvshows' ? '📺' : '🎥';
            const num = (index + 1) < 10 ? `0${index + 1}` : `${index + 1}`;
            const cleanTitle = (item.title || 'Untitled').substring(0, 40);
            listText += `*${num}.* ${typeIcon} [_${siteTag}_] _${cleanTitle}_\n`;
          });

          listText += `\n> 💡 *අවශ්‍ය චිත්‍රපටයේ අංකය පමණක් Reply කරන්න (උදා: 1)*`;
          listText += `\n> ⏰ _වලංගු කාලය: මිනිත්තු 5 කි_`;
          listText += `\n${botFooter}`;

          const sentMovieMsg = await socket.sendMessage(from, {
            image: { url: botLogo },
            caption: listText
          }, { quoted: msg });

          global.movieSessions[from] = {
            step: 'SELECT_MOVIE',
            results: results,
            messageId: sentMovieMsg?.key?.id,
            timestamp: Date.now()
          };

          await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
          break;
        }

        // ────────────────── SHORT MODDED CODE-BLOCK PING ──────────────────
        case 'ping':
        case 'p': {
          const start = Date.now();
          await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });
          const latency = Date.now() - start;
          const uptime = process.uptime();
          const runtime = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
          const ram = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

          let speedTier = '🚀 LIGHTNING';
          if (latency > 250) speedTier = '⚡ ULTRA FAST';
          if (latency > 600) speedTier = '🐢 NORMAL';

          const moddedPing = "```" + `
「 🌸 SAKURA BOT SPEED 🌸 」

│ 🪻 SPEED   : ${latency}ms [${speedTier}]
│ ⏱️ RUNTIME : ${runtime}
│ 💾 RAM     : ${ram} MB
│ 🌷 BOT     : ${botName}
│ 👑 MASTER  : ${config.OWNER_NAME}
` + "```";

          await socket.sendMessage(from, { text: moddedPing.trim() }, { quoted: msg });
          break;
        }
// ────────────────── WHATSAPP STATUS STYLE PING ──────────────────
// ────────────────── GROUP INVITE STYLE PING ──────────────────
case 'system':
case 'p1': {
  const start = Date.now();
  await socket.sendMessage(from, { react: { text: '🏓', key: msg.key } });
  const latency = Date.now() - start;

  // Fake Status Quoted Message
  const fstatus = {
    key: {
      participant: '0@s.whatsapp.net',
      remoteJid: 'status@broadcast',
      fromMe: false,
      id: 'WHATSAPP_STATUS'
    },
    message: {
      conversation: '👥 smart automation.'
    }
  };

  // Logo Buffer එක සකසා ගැනීම
  let thumbBuffer = null;
  try {
    const axios = require('axios');
    const imgUrl = botLogo || config.DEFAULT_LOGO || 'https://i.ibb.co/cS3MjzWj/IMG-20260707-WA0014.jpg';
    const response = await axios.get(imgUrl, { responseType: 'arraybuffer' });
    thumbBuffer = Buffer.from(response.data);
  } catch (e) {
    console.error('Logo Fetch Error:', e);
  }

  const pingText = `🚀 *Speed:* ${latency} ms\n\n┃ ⚡ *${botName || 'fuck'} - Ultra Fast*`;

  // ✅ Baileys standard Group Invite Message payload
  await socket.sendMessage(from, {
    groupInviteMessage: {
      groupJid: '120363000000000000@g.us',
      inviteCode: 'Ping',
      inviteExpiration: Math.floor(Date.now() / 1000) + 86400,
      groupName: '🏓 PONG!',
      caption: pingText,
      jpegThumbnail: thumbBuffer
    }
  }, { quoted: fstatus });
  break;
}
        // ────────────────── MENU COMMAND ──────────────────
        case 'menu':
        case 'help':
        case 'panel': {
          await socket.sendMessage(from, { react: { text: "🌸", key: msg.key } });
          const uptime = process.uptime();
          const runtime = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;
          const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);

          const mainText = `*│* 🌸 *${botName}* 
*╭─────────────···▸*
*│* 👤 *User:* @${senderNumber}
*│* ⏱️ *Uptime:* ${runtime}
*│* 💾 *RAM:* ${ramUsage} MB
*│* 🔣 *Prefix:* \`${prefix}\`
*╰──────────────···▸*

🔢 *REPLY WITH A CATEGORY NUMBER:*

*╭─『 📚 ALL CATEGORIES 』*
*│ [1]* 📥 *Downloaders* 
*│ [2]* 👥 *Group Admin & Protection*
*│ [3]* 🛠️ *Utilities & Tools* 
*│ [4]* 🎭 *Fun & Games*
*│ [5]* ⚙️ *Settings & Bot Toggles*
*│ [6]* 📢 *Channel & Newsletter Suite*
*│ [7]* 🎨 *Bot Customization*
*╰──────────────────────*

> 💡 *Quick Action:* Reply directly with *1*, *2*, *3*, *4*, *5*, *6*, or *7* to view commands.
${botFooter}`.trim();

          const sentMenu = await sendFancyMsg(socket, from, {
            image: { url: botLogo },
            caption: mainText,
            mentions: [nowsender]
          }, msg, userCfg);

          if (sentMenu?.key?.id) {
            userMenuState.set(from, { id: sentMenu.key.id, timestamp: Date.now() });
          }
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
*│* 📌 \`${prefix}pin <query>\` - Pinterest Downloader
*│* 🌐 \`${prefix}tourl\` - File to Direct Link
*│* 🌸 \`${prefix}movie <name>\` - 23 Site Movie Hub
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
*│* 👤 \`${prefix}userinfo @user\` - Get User Profile & DP
*│* 🚪 \`${prefix}logout\` - Log Out & Clear Session
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
*│* 🌸 *Status Emojis:* ${(userCfg.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*╰────────────────────────*

*🔧 TOGGLE SHORTCUTS:*
• \`${prefix}autostatusview on/off\`
• \`${prefix}autostatusreact on/off\`
• \`${prefix}autotyping on/off\`
• \`${prefix}autorecording on/off\`
• \`${prefix}antidelete on/off\`
• \`${prefix}setstatusemoji <emojis>\`
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
*│* 🌸 \`${prefix}setstatusemoji <emoji1,emoji2>\`
*│* ⚡ \`${prefix}ping\` - Check Latency
*│* 🖥️ \`${prefix}system\` - Host Stats
*│* 👑 \`${prefix}owner\` - Owner Contact Info
*│* 📍 \`${prefix}alive\` - Bot Status
*╰────────────────────────*
${botFooter}`;
          await sendFancyMsg(socket, from, { image: { url: botLogo }, caption: cText }, msg, userCfg);
          break;
        }

        // ────────────────── INSTANT MULTI-FORWARD ──────────────────
        case 'forward':
        case 'fwd':
        case 'sendto': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;

          if (!quoted) {
            return await socket.sendMessage(from, { 
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* ඕනෑම Message/File එකකට Reply කරලා:\n│ 🔹 \`${prefix}forward <Number / Group JID>\`\n│ 🔹 \`${prefix}forward @user\`\n│ 🔹 \`${prefix}forward\` (මේ Chat එකටම Forward කිරීමට)\n│ 💡 _කොමා (,) යොදා එකවර කිහිප දෙනෙකුට ද යැවිය හැක._\n╰───────────────━⊷` 
            }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⚡', key: msg.key } });

          try {
            let targetJids = [];
            const input = args.join(' ').trim();

            if (ctxInfo?.mentionedJid && ctxInfo.mentionedJid.length > 0) {
              targetJids.push(...ctxInfo.mentionedJid);
            } else if (input) {
              const rawList = input.split(/[\s,]+/);
              for (let item of rawList) {
                item = item.trim();
                if (!item) continue;

                if (item.endsWith('@s.whatsapp.net') || item.endsWith('@g.us') || item.endsWith('@newsletter')) {
                  targetJids.push(item);
                } else {
                  const cleanNum = item.replace(/[^0-9]/g, '');
                  if (cleanNum.length >= 7) {
                    targetJids.push(cleanNum + '@s.whatsapp.net');
                  }
                }
              }
            }

            if (targetJids.length === 0) {
              targetJids.push(from);
            }

            let cleanQuoted = quoted;
            if (cleanQuoted.ephemeralMessage) cleanQuoted = cleanQuoted.ephemeralMessage.message;
            if (cleanQuoted.viewOnceMessageV2) cleanQuoted = cleanQuoted.viewOnceMessageV2.message;
            if (cleanQuoted.viewOnceMessage) cleanQuoted = cleanQuoted.viewOnceMessage.message;

            const fwdContext = {
              ...getForwardedContext(userCfg),
              forwardingScore: 9999,
              isForwarded: true
            };

            for (const target of targetJids) {
              await socket.sendMessage(target, {
                forward: {
                  key: {
                    remoteJid: from,
                    id: ctxInfo.stanzaId,
                    fromMe: !ctxInfo.participant,
                    participant: ctxInfo.participant
                  },
                  message: cleanQuoted
                },
                contextInfo: fwdContext
              });
            }

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('Forward Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ Forward Failed: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── MASTER OWNER CONTROLS ──────────────────
        case 'sessions':
        case 'listsessions':
        case 'bots': {
          if (!isMasterOwner) return await socket.sendMessage(from, { text: '❌ මේ command එක භාවිත කළ හැක්කේ Main Bot Owner ට පමණි.' }, { quoted: msg });
          const allDbNums = await getAllNumbersFromMongo();
          const activeList = Array.from(activeSockets.keys());
          
          let text = `╭───〔 🤖 *ALL REGISTERED SESSIONS* 〕───⊷\n`;
          text += `│ 🟢 *Active Bots:* ${activeList.length}\n`;
          text += `│ 📦 *Total in Database:* ${allDbNums.length}\n╰──────────────────────────⊷\n\n`;
          
          if (!allDbNums.length) {
            text += `_කිසිදු session එකක් හමු නොවීය._`;
          } else {
            allDbNums.forEach((n, idx) => {
              const isActive = activeSockets.has(n);
              text += `*${idx + 1}.* +${n} ➔ ${isActive ? '🟢 Active' : '🔴 Offline'}\n`;
            });
          }
          text += `\n> 💡 *Update any bot:* \`${prefix}setbotcfg <number> <key> <value>\``;
          await socket.sendMessage(from, { text }, { quoted: msg });
          break;
        }

        case 'setbotcfg':
        case 'setbotconfig': {
          if (!isMasterOwner) return await socket.sendMessage(from, { text: '❌ මේ command එක භාවිත කළ හැක්කේ Main Bot Owner ට පමණි.' }, { quoted: msg });
          if (args.length < 3) {
            return await socket.sendMessage(from, {
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}setbotcfg <number> <key> <value>\`\n│ 💡 *Keys:* \`prefix\`, \`botname\`, \`autoview\`, \`autolike\`, \`autotyping\`, \`autorecording\`, \`antidelete\`, \`logo\`, \`footer\`\n│ 📝 *උදා:* \`${prefix}setbotcfg 94789088223 prefix !\`\n╰───────────────━⊷`
            }, { quoted: msg });
          }
          const targetNum = args[0].replace(/[^0-9]/g, '');
          const key = args[1].toLowerCase();
          const val = args.slice(2).join(' ').trim();

          const targetCfg = await loadUserConfigFromMongo(targetNum);

          if (key === 'prefix') targetCfg.PREFIX = val;
          else if (key === 'botname') targetCfg.botName = val;
          else if (key === 'logo') targetCfg.logo = val;
          else if (key === 'footer') targetCfg.footer = `> *${val}*`;
          else if (key === 'autoview' || key === 'autostatusview') targetCfg.AUTO_VIEW_STATUS = (val === 'on' || val === 'true') ? 'true' : 'false';
          else if (key === 'autolike' || key === 'autostatusreact') targetCfg.AUTO_LIKE_STATUS = (val === 'on' || val === 'true') ? 'true' : 'false';
          else if (key === 'autotyping') targetCfg.AUTO_TYPING = (val === 'on' || val === 'true') ? 'true' : 'false';
          else if (key === 'autorecording') targetCfg.AUTO_RECORDING = (val === 'on' || val === 'true') ? 'true' : 'false';
          else if (key === 'antidelete') targetCfg.ANTI_DELETE = (val === 'on' || val === 'true') ? 'true' : 'off';
          else {
            return await socket.sendMessage(from, { text: `❌ වලංගු key එකක් ලබා දෙන්න.` }, { quoted: msg });
          }

          await setUserConfigInMongo(targetNum, targetCfg);
          await socket.sendMessage(from, { text: `✅ +${targetNum} සඳහා *${key}* සැකසුම සාර්ථකව *${val}* ලෙස Update කෙරිණි.` }, { quoted: msg });
          break;
        }

        case 'setstatusemoji':
        case 'setstatusemojis': {
          if (!isOwnerUser) return;
          const emojisInput = args.join(' ').trim();
          if (!emojisInput) {
            return await socket.sendMessage(from, { text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}setstatusemoji <emojis comma වලින්>\`\n│ 💡 *උදා:* \`${prefix}setstatusemoji 🌸,🪻,🌷,❤️\`\n╰───────────────━⊷` }, { quoted: msg });
          }
          const emojiList = emojisInput.split(/[\s,]+/).filter(Boolean);
          if (!emojiList.length) return await socket.sendMessage(from, { text: '❌ වලංගු emojis ලබා දෙන්න.' }, { quoted: msg });
          
          userCfg.AUTO_LIKE_EMOJI = emojiList;
          await setUserConfigInMongo(sanitizedNum, userCfg);
          await socket.sendMessage(from, { text: `✅ Status reaction emojis යාවත්කාලීන විය: ${emojiList.join(' ')}` }, { quoted: msg });
          break;
        }

        case 'logout':
        case 'delsession':
        case 'clearsession': {
          if (!isOwnerUser) return;
          await socket.sendMessage(from, { text: '🗑️ *Deleting bot session and disconnecting...*' }, { quoted: msg });
          await delay(1500);
          await deleteEntireSession(sanitizedNum);
          break;
        }

        // ────────────────── PINTEREST DOWNLOADER ──────────────────
        case 'pin':
        case 'pinterest': {
          const input = args.join(' ').trim();
          const SESSION_TIMEOUT = 5 * 60 * 1000;

          if (!input) {
            return await socket.sendMessage(from, { 
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}pin <සර්ච් වචනය>\`\n│ 💡 _සර්ච් කළ පසු අංකය reply කරන්න (උදා: 1)_\n╰───────────────━⊷` 
            }, { quoted: msg });
          }

          const selectedNum = parseInt(input);
          const isSelection = !isNaN(selectedNum) && String(selectedNum) === input;

          if (isSelection) {
            const session = global.pinSessions?.[from];

            if (!session || !session.results?.length) {
              return await socket.sendMessage(from, { text: `❌ කලින් \`${prefix}pin <වචනය>\` කියලා search කරන්න.` }, { quoted: msg });
            }

            const elapsed = Date.now() - session.timestamp;
            if (elapsed > SESSION_TIMEOUT) {
              delete global.pinSessions[from];
              return await socket.sendMessage(from, { text: `⌛ Session එක expire වී ඇත. කරුණාකර නැවත search කරන්න.` }, { quoted: msg });
            }

            if (selectedNum < 1 || selectedNum > session.results.length) {
              return await socket.sendMessage(from, { text: `❌ 1 සිට ${session.results.length} අතර number එකක් දාන්න.` }, { quoted: msg });
            }

            await socket.sendMessage(from, { react: { text: '📥', key: msg.key } });

            try {
              const selected = session.results[selectedNum - 1];
              const mediaUrl = selected.image || selected.url || selected.post;

              if (!mediaUrl) throw new Error('මේ item එකේ download link එකක් නැත.');

              const isVideo = mediaUrl.includes('.mp4') || mediaUrl.match(/video/i);

              const buffer = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
              });

              if (isVideo) {
                await socket.sendMessage(from, {
                  video: Buffer.from(buffer.data),
                  mimetype: 'video/mp4',
                  caption: `✅ *Pinterest Video* | 🌸 ${botName}`
                }, { quoted: msg });
              } else {
                await socket.sendMessage(from, {
                  image: Buffer.from(buffer.data),
                  mimetype: 'image/jpeg',
                  caption: `✅ *Pinterest Image* | 🌸 ${botName}`
                }, { quoted: msg });
              }

              await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
              delete global.pinSessions[from];

            } catch (err) {
              console.error('Pinterest Download Error:', err);
              await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
              await socket.sendMessage(from, { text: `❌ Download failed: ${err.message}` }, { quoted: msg });
            }

          } else {
            await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });

            try {
              const Pinterest = require('@myno_21/pinterest-scraper');
              const results = await Pinterest.search(input);

              if (!results || !results.length) {
                return await socket.sendMessage(from, { text: '❌ කිසිවක් හමු නොවීය.' }, { quoted: msg });
              }

              const limited = results.slice(0, 25);
              if (!global.pinSessions) global.pinSessions = {};

              let listText = `╭───〔 📌 *PINTEREST RESULTS* 〕───⊷\n│ 🔎 *Query:* ${input}\n╰──────────────────────────⊷\n\n`;
              limited.forEach((item, i) => {
                const title = item.title || item.image || `Result ${i + 1}`;
                listText += `*${i + 1}.* ${title.substring(0, 45)}\n`;
              });
              listText += `\n> 💬 *අවශ්‍ය අංකය පමණක් Reply කරන්න (1-${limited.length})*`;

              const sentPinMsg = await socket.sendMessage(from, { text: listText }, { quoted: msg });
              global.pinSessions[from] = { 
                results: limited, 
                messageId: sentPinMsg?.key?.id,
                timestamp: Date.now()
              };

              await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

            } catch (err) {
              console.error('Pinterest Search Error:', err);
              await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
              await socket.sendMessage(from, { text: `❌ *දෝෂයක් සිදු විය:* ${err.message}` }, { quoted: msg });
            }
          }
          break;
        }

        // ────────────────── YOUTUBE TO MP3 ──────────────────
        case 'mp3':
        case 'ytmp3': {
          if (!args.length) {
            return await socket.sendMessage(from, { 
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}mp3 <YouTube Link>\`\n╰───────────────━⊷` 
            }, { quoted: msg });
          }

          const videoUrl = args[0];
          const CHAMA_API = 'chama_api_7f4ac9c10c749bcedbd4437a066009a2';
          const CHAMA_BASE = 'https://chama-movie-api.koyeb.app/api/v1';

          if (!videoUrl.includes('youtube.com') && !videoUrl.includes('youtu.be')) {
            return await socket.sendMessage(from, { text: '❌ වලංගු YouTube link එකක් යොදන්න.' }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const mp3Res = await axios.get(`${CHAMA_BASE}/youtube/mp3`, {
              params: {
                url: videoUrl,
                quality: '320kbps',
                source: 'auto',
                api_key: CHAMA_API
              },
              timeout: 60000
            });

            if (!mp3Res.data?.status || !mp3Res.data?.data?.direct_url) {
              throw new Error(mp3Res.data?.message || 'MP3 link එක ලබාගන්න බැරි වුණා.');
            }

            const mp3Data = mp3Res.data.data;
            const songTitle = mp3Data.title || 'Unknown Song';
            const thumbnailUrl = mp3Data.thumbnail || 'https://i.ibb.co/Lz68N877/ping-1.jpg';
            const downloadUrl = mp3Data.direct_url;

            await socket.sendMessage(from, { react: { text: '📥', key: msg.key } });

            const audioBuffer = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              timeout: 90000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });

            const cleanTitle = songTitle.replace(/[\\/:*?"<>|]/g, '');

            const infoText = 
`╭───〔 🎵 *MP3 DOWNLOADER* 〕───⊷
│ 📌 *𝑻𝒊𝒕𝒍𝒆:* ${songTitle}
╰──────────────────────────⊷
> ✅ _𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅𝒆𝒅!_`;

            await socket.sendMessage(from, {
              image: { url: thumbnailUrl },
              caption: infoText
            }, { quoted: msg });

            await socket.sendMessage(from, {
              audio: Buffer.from(audioBuffer.data),
              mimetype: 'audio/mpeg',
              fileName: `${cleanTitle}.mp3`,
              ptt: false
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('MP3 Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ *දෝෂයක් සිදු විය:* ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── FILE TO URL UPLOADER ──────────────────
        case 'url':
        case 'upload':
        case 'tourl': {
          const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const targetMsg = quoted
            ? { message: quoted, key: { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId } }
            : msg;

          const mediaType = quoted
            ? Object.keys(quoted)[0]
            : Object.keys(msg.message || {})[0];

          const isMedia = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']
            .includes(mediaType);

          if (!isMedia) {
            return await socket.sendMessage(from, {
              text: `❌ *භාවිතය:* image/video/voice message එකකට reply කරලා \`${prefix}url\` කියලා යොදන්න.`
            }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buffer = await downloadMediaMessage(targetMsg, 'buffer', {});

            if (!buffer || buffer.length === 0) throw new Error('Media download කරගන්න බැරි වුණා.');

            const extMap = {
              imageMessage: 'jpg',
              videoMessage: 'mp4',
              audioMessage: 'mp3',
              documentMessage: 'pdf',
              stickerMessage: 'webp'
            };
            const ext = extMap[mediaType] || 'bin';
            const fileName = `upload_${Date.now()}.${ext}`;

            const FormData = require('form-data');

            const sources = [
              async () => {
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', buffer, fileName);
                const res = await axios.post('https://catbox.moe/user/api.php', form, {
                  headers: form.getHeaders(),
                  timeout: 60000
                });
                const url = typeof res.data === 'string' ? res.data.trim() : null;
                return url && url.startsWith('http') ? url : null;
              },
              async () => {
                const form = new FormData();
                form.append('file', buffer, fileName);
                const res = await axios.post('https://0x0.st', form, {
                  headers: form.getHeaders(),
                  timeout: 60000
                });
                const url = typeof res.data === 'string' ? res.data.trim() : null;
                return url && url.startsWith('http') ? url : null;
              },
              async () => {
                const form = new FormData();
                form.append('files[]', buffer, fileName);
                const res = await axios.post('https://uguu.se/upload', form, {
                  headers: form.getHeaders(),
                  timeout: 60000
                });
                const url = res.data?.files?.[0]?.url;
                return url || null;
              }
            ];

            let finalUrl = null;
            let usedService = '';
            const names = ['Catbox', '0x0.st', 'Uguu'];

            for (let i = 0; i < sources.length; i++) {
              try {
                const url = await sources[i]();
                if (url) {
                  finalUrl = url;
                  usedService = names[i];
                  break;
                }
              } catch (e) {}
            }

            if (!finalUrl) throw new Error('Upload සේවාවන් ක්‍රියා විරහිතයි.');

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });
            await socket.sendMessage(from, {
              text: `✅ *Upload Success!*\n\n🔗 *URL:* ${finalUrl}\n🌐 *Service:* ${usedService}\n🌸 ${botName}`
            }, { quoted: msg });

          } catch (err) {
            console.error('Upload Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ Upload failed: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── INSTAGRAM DOWNLOADER ──────────────────
        case 'ig':
        case 'instagram': {
          if (!args.length) {
            return await socket.sendMessage(from, { text: `❌ *භාවිතය:* \`${prefix}ig <Instagram Post/Reel Link>\`` }, { quoted: msg });
          }

          const igUrl = args[0];
          if (!igUrl.includes('instagram.com')) {
            return await socket.sendMessage(from, { text: '❌ Enter a valid Instagram Link.' }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const sources = [
              async () => {
                const { ndown } = require('nayan-media-downloader');
                const res = await ndown(igUrl);
                const data = res?.data;
                if (!data) return null;
                const list = Array.isArray(data) ? data : [data];
                return list.map(m => m.url).filter(Boolean);
              },
              async () => {
                const { instagramdl, instagramdlv2 } = require('@bochilteam/scraper');
                const res = await instagramdl(igUrl).catch(() => instagramdlv2(igUrl));
                const data = res?.data || res?.result || res;
                if (!data) return null;
                const list = Array.isArray(data) ? data : [data];
                return list.map(m => m.url || m.download_url || m).filter(Boolean);
              },
              async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/igdl?url=${encodeURIComponent(igUrl)}`, { timeout: 20000 });
                const media = res.data?.data;
                if (Array.isArray(media)) return media.map(m => m.url || m);
                return null;
              }
            ];

            let mediaUrls = null;
            for (const getMedia of sources) {
              try {
                const urls = await getMedia();
                if (urls && urls.length > 0) {
                  mediaUrls = urls;
                  break;
                }
              } catch (e) {}
            }

            if (!mediaUrls) throw new Error('🌷 Sorry download error');

            await socket.sendMessage(from, { react: { text: '📥', key: msg.key } });

            for (const mediaUrl of mediaUrls) {
              const isVideo = mediaUrl.includes('.mp4') || mediaUrl.match(/video/i);

              const buffer = await axios.get(mediaUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
              });

              if (isVideo) {
                await socket.sendMessage(from, {
                  video: Buffer.from(buffer.data),
                  mimetype: 'video/mp4',
                  caption: `✅ *Instagram Video* | 🌸 ${botName}`
                }, { quoted: msg });
              } else {
                await socket.sendMessage(from, {
                  image: Buffer.from(buffer.data),
                  mimetype: 'image/jpeg',
                  caption: `✅ *Instagram Photo* | 🌸 ${botName}`
                }, { quoted: msg });
              }
            }

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('Instagram Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ Instagram download failed: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── TIKTOK DOWNLOADER ──────────────────
        case 'tiktok':
        case 'tt': {
          if (!args.length) {
            return await socket.sendMessage(from, { text: `❌ *භාවිතය:*\n\`${prefix}tiktok <TikTok Link / Search Query>\`` }, { quoted: msg });
          }

          const query = args.join(' ');
          const isLink = query.includes('tiktok.com');
          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            let videoUrl = query;
            let videoTitle = 'TikTok Video';
            let author = '';

            if (!isLink) {
              await socket.sendMessage(from, { react: { text: '🔍', key: msg.key } });

              let searchResult = null;

              try {
                const res = await axios.get(`https://www.tikwm.com/api/feed/search?keywords=${encodeURIComponent(query)}&count=1`, { timeout: 20000 });
                const item = res.data?.data?.videos?.[0];
                if (item) {
                  searchResult = {
                    url: `https://www.tiktok.com/@${item.author?.unique_id}/video/${item.video_id}`,
                    title: item.title,
                    author: item.author?.nickname
                  };
                }
              } catch (e) {}

              if (!searchResult) {
                try {
                  const TiktokDL = require('@tobyg74/tiktok-api-dl');
                  const res = await TiktokDL.Search(query, { type: 'video', page: 1 });
                  const item = res?.result?.videos?.[0] || res?.result?.[0];
                  if (item) {
                    searchResult = {
                      url: item?.video?.playAddr?.[0] ? null : `https://www.tiktok.com/@${item?.author?.username}/video/${item?.id}`,
                      title: item?.title || item?.desc,
                      author: item?.author?.nickname
                    };
                  }
                } catch (e) {}
              }

              if (!searchResult || !searchResult.url) {
                return await socket.sendMessage(from, { text: '❌ Not found.' }, { quoted: msg });
              }

              videoUrl = searchResult.url;
              videoTitle = searchResult.title || videoTitle;
              author = searchResult.author || '';
            }

            await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });

            const sources = [
              async () => {
                const TiktokDL = require('@tobyg74/tiktok-api-dl');
                const result = await TiktokDL.Downloader(videoUrl, { version: 'v1' });
                if (result?.status !== 'success') throw new Error('v1 failed');
                if (result?.result?.desc) videoTitle = result.result.desc;
                if (result?.result?.author?.nickname) author = result.result.author.nickname;
                const videos = result?.result?.videoHD || result?.result?.video || result?.result?.videoSD;
                return Array.isArray(videos) ? videos[0] : videos;
              },
              async () => {
                const res = await axios.get(`https://www.tikwm.com/api/?url=${encodeURIComponent(videoUrl)}`, { timeout: 20000 });
                if (res.data?.data?.title) videoTitle = res.data.data.title;
                if (res.data?.data?.author?.nickname) author = res.data.data.author.nickname;
                return res.data?.data?.hdplay || res.data?.data?.play;
              }
            ];

            let downloadUrl = null;
            for (const getVideo of sources) {
              try {
                const url = await getVideo();
                if (url && typeof url === 'string' && url.startsWith('http')) {
                  downloadUrl = url;
                  break;
                }
              } catch (e) {}
            }

            if (!downloadUrl) throw new Error('Video download failed');

            const videoBuffer = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            await socket.sendMessage(from, {
              video: Buffer.from(videoBuffer.data),
              mimetype: 'video/mp4',
              caption: `✅ *${videoTitle}*${author ? `\n👤 ${author}` : ''}\n🌸 ${botName}`
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('TikTok Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ TikTok download failed: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── FACEBOOK DOWNLOADER ──────────────────
        case 'fb':
        case 'facebook': {
          if (!args.length) {
            return await socket.sendMessage(from, { text: `❌ *භාවිතය:* \`${prefix}fb <Facebook Video Link>\`` }, { quoted: msg });
          }

          const fbUrl = args[0];
          if (!fbUrl.includes('facebook.com') && !fbUrl.includes('fb.watch')) {
            return await socket.sendMessage(from, { text: '❌ Invalid Facebook URL.' }, { quoted: msg });
          }

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const sources = [
              async () => {
                const { getFbVideoInfo } = require('fb-downloader-scrapper');
                const data = await getFbVideoInfo(fbUrl);
                return data?.hd || data?.sd;
              },
              async () => {
                const getFBInfo = require('@xaviabot/fb-downloader');
                const data = await getFBInfo(fbUrl);
                return data?.hd || data?.sd;
              },
              async () => {
                const res = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(fbUrl)}`, { timeout: 20000 });
                return res.data?.data?.[0]?.url || res.data?.data?.hd || res.data?.data?.sd;
              }
            ];

            let downloadUrl = null;
            for (const getVideo of sources) {
              try {
                const url = await getVideo();
                if (url && typeof url === 'string' && url.startsWith('http')) {
                  downloadUrl = url;
                  break;
                }
              } catch (e) {}
            }

            if (!downloadUrl) throw new Error('Download link not found.');

            const videoBuffer = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            await socket.sendMessage(from, {
              video: Buffer.from(videoBuffer.data),
              mimetype: 'video/mp4',
              caption: `✅ *Facebook Video* | 🌸 ${botName}`
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('FB Download Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ Facebook download failed: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── SONG DOWNLOADER ──────────────────
        case 'song':
        case 'play': {
          if (!args.length) {
            return await socket.sendMessage(from, { 
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}song <ගීතයේ නම / Link>\`\n╰───────────────━⊷` 
            }, { quoted: msg });
          }

          const query = args.join(' ');
          const CHAMA_API = 'chama_api_7f4ac9c10c749bcedbd4437a066009a2';
          const CHAMA_BASE = 'https://chama-movie-api.koyeb.app/api/v1';

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            let videoUrl = query;
            let songTitle = 'Unknown Song';
            let thumbnailUrl = 'https://i.ibb.co/Lz68N877/ping-1.jpg';
            let duration = '0:00';
            let channelName = 'YouTube';

            if (!isUrl) {
              const searchRes = await axios.get(`${CHAMA_BASE}/media/youtube/search`, {
                params: { q: query, api_key: CHAMA_API },
                timeout: 20000
              });

              const results = searchRes.data?.data;
              if (!searchRes.data?.status || !Array.isArray(results) || !results.length) {
                return await socket.sendMessage(from, { text: '❌ කිසිදු ගීතයක් හමු නොවීය.' }, { quoted: msg });
              }

              const vid = results[0];
              videoUrl = vid.youtube_url;
              songTitle = vid.title;
              thumbnailUrl = vid.thumbnail || thumbnailUrl;
              channelName = vid.uploader || channelName;

              const mins = Math.floor(vid.duration / 60);
              const secs = String(vid.duration % 60).padStart(2, '0');
              duration = `${mins}:${secs}`;
            }

            const infoText = 
`╭───〔 🎵 *SONG DOWNLOADER* 〕───⊷
│ 📌 *𝑻𝒊𝒕𝒍𝒆:* ${songTitle}
│ ⏱️ *𝑫𝒖𝒓𝒊𝒏𝒈:* ${duration}
│ 👤 *𝑪𝒉𝒂𝒏𝒏𝒆𝒍:* ${channelName}
╰──────────────────────────⊷
> 🪻 _𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅𝒊𝒏𝒈..._`;

            const infoMsg = await socket.sendMessage(from, {
              image: { url: thumbnailUrl },
              caption: infoText
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '🎵', key: msg.key } });

            const mp3Res = await axios.get(`${CHAMA_BASE}/youtube/mp3`, {
              params: {
                url: videoUrl,
                quality: '320kbps',
                source: 'auto',
                api_key: CHAMA_API
              },
              timeout: 60000
            });

            if (!mp3Res.data?.status || !mp3Res.data?.data?.direct_url) {
              throw new Error(mp3Res.data?.message || 'MP3 link එක ලබාගන්න බැරි වුණා.');
            }

            const mp3Data = mp3Res.data.data;
            if (mp3Data.title) songTitle = mp3Data.title;
            const downloadUrl = mp3Data.direct_url;

            const audioBuffer = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              timeout: 90000,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const cleanTitle = songTitle.replace(/[\\/:*?"<>|]/g, '');

            await socket.sendMessage(from, {
              audio: Buffer.from(audioBuffer.data),
              mimetype: 'audio/mpeg',
              fileName: `${cleanTitle}.mp3`,
              ptt: false
            }, { quoted: infoMsg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('Song Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ *දෝෂයක් සිදු විය:* ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── VIDEO DOWNLOADER ──────────────────
        case 'ytmp4':
        case 'mp4':
        case 'video':
        case 'ytv': {
          if (!args.length) {
            return await socket.sendMessage(from, { 
              text: `╭───────────────━⊷\n│ ⚠️ *භාවිතය:* \`${prefix}video <වීඩියෝවේ නම / Link>\`\n╰───────────────━⊷` 
            }, { quoted: msg });
          }

          const query = args.join(' ');
          const CHAMA_API = 'chama_api_7f4ac9c10c749bcedbd4437a066009a2';
          const CHAMA_BASE = 'https://chama-movie-api.koyeb.app/api/v1';

          await socket.sendMessage(from, { react: { text: '⏳', key: msg.key } });

          try {
            const isUrl = query.startsWith('http://') || query.startsWith('https://');
            let videoUrl = query;
            let songTitle = 'Unknown Video';
            let thumbnailUrl = 'https://i.ibb.co/Lz68N877/ping-1.jpg';
            let duration = '0:00';
            let channelName = 'YouTube';

            if (!isUrl) {
              const searchRes = await axios.get(`${CHAMA_BASE}/media/youtube/search`, {
                params: { q: query, api_key: CHAMA_API },
                timeout: 20000
              });

              const results = searchRes.data?.data;
              if (!searchRes.data?.status || !Array.isArray(results) || !results.length) {
                return await socket.sendMessage(from, { text: '❌ කිසිදු වීඩියෝවක් හමු නොවීය.' }, { quoted: msg });
              }

              const vid = results[0];
              videoUrl = vid.youtube_url;
              songTitle = vid.title;
              thumbnailUrl = vid.thumbnail || thumbnailUrl;
              channelName = vid.uploader || channelName;

              const mins = Math.floor(vid.duration / 60);
              const secs = String(vid.duration % 60).padStart(2, '0');
              duration = `${mins}:${secs}`;
            }

            const infoText = 
`╭───〔 🎬 *VIDEO DOWNLOADER* 〕───⊷
│ 📌 *𝑻𝒊𝒕𝒍𝒆:* ${songTitle}
│ ⏱️ *𝑻𝒊𝒎𝒆:* ${duration}
│ 👤 *𝑪𝒉𝒂𝒏𝒏𝒆𝒍:* ${channelName}
╰──────────────────────────⊷
> 🪻 _𝑫𝒐𝒘𝒏𝒍𝒐𝒂𝒅𝒊𝒏𝒈..._`;

            const infoMsg = await socket.sendMessage(from, {
              image: { url: thumbnailUrl },
              caption: infoText
            }, { quoted: msg });

            await socket.sendMessage(from, { react: { text: '🎬', key: msg.key } });

            const mp4Res = await axios.get(`${CHAMA_BASE}/youtube/mp4`, {
              params: {
                url: videoUrl,
                quality: '720p',
                source: 'auto',
                api_key: CHAMA_API
              },
              timeout: 60000
            });

            if (!mp4Res.data?.status || !mp4Res.data?.data?.direct_url) {
              throw new Error(mp4Res.data?.message || 'MP4 link එක ලබාගන්න බැරි වුණා.');
            }

            const mp4Data = mp4Res.data.data;
            if (mp4Data.title) songTitle = mp4Data.title;
            const downloadUrl = mp4Data.direct_url;

            const videoBuffer = await axios.get(downloadUrl, {
              responseType: 'arraybuffer',
              timeout: 120000,
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });

            const cleanTitle = songTitle.replace(/[\\/:*?"<>|]/g, '');

            await socket.sendMessage(from, {
              video: Buffer.from(videoBuffer.data),
              mimetype: 'video/mp4',
              fileName: `${cleanTitle}.mp4`,
              caption: `✅ *${songTitle}*`
            }, { quoted: infoMsg });

            await socket.sendMessage(from, { react: { text: '✅', key: msg.key } });

          } catch (err) {
            console.error('Video Error:', err);
            await socket.sendMessage(from, { react: { text: '❌', key: msg.key } });
            await socket.sendMessage(from, { text: `❌ *දෝෂයක් සිදු විය:* ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ────────────────── USERINFO ──────────────────
        case 'userinfo':
        case 'whois':
        case 'getdp': {
          try {
            let target;
            const ctxInfo = msg.message?.extendedTextMessage?.contextInfo;
            const mentioned = ctxInfo?.mentionedJid;
            const quotedSender = ctxInfo?.participant;
            const inputNum = args.join(' ').trim();

            if (mentioned && mentioned.length > 0) {
              target = mentioned[0];
            } else if (quotedSender) {
              target = quotedSender;
            } else if (inputNum) {
              const cleanNum = inputNum.replace(/[^0-9]/g, '');
              if (!cleanNum) {
                return await socket.sendMessage(from, { text: '❌ Please provide a valid WhatsApp number.' }, { quoted: msg });
              }
              target = cleanNum + '@s.whatsapp.net';
            } else {
              return await socket.sendMessage(from, {
                text: `❌ *USER INFO USAGE*\n\n• \`${prefix}userinfo @user\`\n• Reply to a message with \`${prefix}userinfo\`\n• \`${prefix}userinfo 947xxxxxxxx\``
              }, { quoted: msg });
            }

            target = jidNormalizedUser(target);

            let userJid = target;
            try {
              if (typeof socket.onWhatsApp === 'function') {
                const result = await socket.onWhatsApp(target);
                if (!result || result.length === 0 || result[0]?.exists === false) {
                  return await socket.sendMessage(from, { text: '❌ This number is not registered on WhatsApp.' }, { quoted: msg });
                }
                if (result[0]?.jid) {
                  userJid = jidNormalizedUser(result[0].jid);
                }
              }
            } catch (e) {
              userJid = target;
            }

            const number = userJid.split('@')[0].split(':')[0];

            let contactName = 'Unknown';
            try {
              if (typeof socket.getName === 'function') {
                const name = await socket.getName(userJid);
                if (name) contactName = name;
              }
            } catch (e) {}

            if (contactName === 'Unknown' && ctxInfo?.pushName) {
              contactName = ctxInfo.pushName;
            }

            let userBio = 'Hidden / Not set';
            let bioDate = 'Unknown';
            try {
              if (typeof socket.fetchStatus === 'function') {
                let statusRes = await socket.fetchStatus(userJid);
                if (Array.isArray(statusRes)) statusRes = statusRes[0];
                
                if (statusRes) {
                  if (typeof statusRes.status === 'string' && statusRes.status.trim() !== '') {
                    userBio = statusRes.status;
                  }
                  if (statusRes.setAt) {
                    bioDate = moment(statusRes.setAt).tz('Asia/Colombo').format('YYYY-MM-DD');
                  }
                }
              }
            } catch (e) {}

            let ppUrl = null;
            try {
              if (typeof socket.profilePictureUrl === 'function') {
                try {
                  ppUrl = await socket.profilePictureUrl(userJid, 'image');
                } catch {
                  ppUrl = await socket.profilePictureUrl(userJid, 'preview');
                }
              }
            } catch (e) {
              ppUrl = null;
            }

            let accountType = 'Standard Account';
            try {
              if (typeof socket.getBusinessProfile === 'function') {
                const business = await socket.getBusinessProfile(userJid);
                if (business) accountType = 'Business Account';
              }
            } catch (e) {}

            const infoText = `╭━━━〔 👤 *USER INFO* 〕━━━╮
┃
┃ 👤 *Name:* ${contactName}
┃ 📞 *Number:* +${number}
┃ 🆔 *JID:* \`${userJid}\`
┃
┃ 📝 *About:* ${userBio}
┃ 📅 *About Date:* ${bioDate}
┃ 🏢 *Account:* ${accountType}
┃
╰━━━━━━━━━━━━━━━━━━╯
${botFooter}`;

            if (ppUrl) {
              await sendFancyMsg(socket, from, {
                image: { url: ppUrl },
                caption: infoText,
                mentions: [userJid]
              }, msg, userCfg);
            } else {
              await sendFancyMsg(socket, from, {
                text: infoText,
                mentions: [userJid]
              }, msg, userCfg);
            }

          } catch (err) {
            console.error('❌ USERINFO ERROR:', err);
            await socket.sendMessage(from, { text: `❌ *USERINFO ERROR*\n\n${err?.message || err}` }, { quoted: msg });
          }
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
              text: `❌ *Format Error!*\n*Usage:* \`${prefix}addreply <type>|<trigger_word>|<text_or_url>\`\n*Types:* \`text\`, \`voice\`, \`image\`, \`video\`, \`sticker\``
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
*හෙ͠ලෝ͠ හෙලෝ ─⃞මන් ඔන්ලයින් 🌸⃘̬ٜٜඉන්නවා තාමٜ͠🍃⃘̬͞⃝🦋》*
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
      await deleteEntireSession(san);
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
async function EmpirePair(number, res, isForce = false) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `sakura_session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});

  if (activeSockets.has(sanitizedNumber)) {
    try {
      const oldSock = activeSockets.get(sanitizedNumber);
      oldSock.ev.removeAllListeners('connection.update');
      oldSock.ev.removeAllListeners('messages.upsert');
      oldSock.ws?.close();
    } catch(e) {}
    activeSockets.delete(sanitizedNumber);
  }

  if (isForce) {
    await deleteEntireSession(sanitizedNumber);
  } else {
    try {
      const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
      if (mongoDoc && mongoDoc.files) {
        fs.ensureDirSync(sessionPath);
        for (const [fname, content] of Object.entries(mongoDoc.files)) {
          try { fs.writeFileSync(path.join(sessionPath, fname), content, 'utf8'); } catch(e) {}
        }
      }
    } catch (e) {}
  }

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

    if (pendingInactivityTimers.has(sanitizedNumber)) {
      clearTimeout(pendingInactivityTimers.get(sanitizedNumber));
    }
    
    const inactivityTimeout = setTimeout(async () => {
      if (!activeSockets.has(sanitizedNumber)) {
        console.log(`⏱️ [Inactivity Cleanup] +${sanitizedNumber} remained inactive for 1 minute. Purging session...`);
        await deleteEntireSession(sanitizedNumber);
      }
    }, 60 * 1000);

    pendingInactivityTimers.set(sanitizedNumber, inactivityTimeout);

    if (!socket.authState.creds.registered) {
      let code;
      try {
        await delay(1500);
        code = await socket.requestPairingCode(sanitizedNumber);
      } catch (error) {
        console.error('Pairing code generation error:', error.message);
      }
      if (!res.headersSent) res.send({ code: code || null, number: sanitizedNumber, status: 'pairing_code_generated' });
    } else {
      if (!res.headersSent) {
        res.send({ 
          status: 'already_connected', 
          number: sanitizedNumber,
          message: 'Session is already connected. To re-generate code, pass &force=true' 
        });
      }
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
        if (pendingInactivityTimers.has(sanitizedNumber)) {
          clearTimeout(pendingInactivityTimers.get(sanitizedNumber));
          pendingInactivityTimers.delete(sanitizedNumber);
        }

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
  const { number, force, reset } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  const sanitized = number.replace(/[^0-9]/g, '');

  const isForce = force === 'true' || force === '1' || reset === 'true' || reset === '1';

  if (isForce && activeSockets.has(sanitized)) {
    await deleteEntireSession(sanitized);
  }

  await EmpirePair(number, res, isForce);
});

router.get('/delete', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  const sanitized = number.replace(/[^0-9]/g, '');
  await deleteEntireSession(sanitized);
  res.send({ status: 'success', message: `Session for +${sanitized} deleted successfully.` });
});

router.get('/logout', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });
  const sanitized = number.replace(/[^0-9]/g, '');
  await deleteEntireSession(sanitized);
  res.send({ status: 'success', message: `Logged out and session cleared for +${sanitized}.` });
});

router.get('/active', (req, res) => {
  res.status(200).send({ botName: config.BOT_NAME, count: activeSockets.size, numbers: Array.from(activeSockets.keys()) });
});

router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: config.BOT_NAME, activesession: activeSockets.size });
});

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

