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
    AUTO_LIKE_EMOJI: ['💙', '🩷', '💜', '🤎', '🧡', '🩵', '💛', '🩶', '♥️', '💗', '❤️‍🔥'],
  PREFIX: '.',
  MAX_RETRIES: 3,
  GROUP_INVITE_LINK: 'xxxxxxxxxxx',
  KEZU_IMG: 'https://files.catbox.moe/begcjv.png',
  NEWSLETTER_JID: '000000000000000@newsletter',
  OTP_EXPIRY: 300000,
  WORK_TYPE: 'public',
  OWNER_NUMBER: process.env.OWNER_NUMBER || '94711214607,94705851067',
  CHANNEL_LINK: 'https://whatsapp.com/channel/xxxxxxxxxxxxx>',
  BOT_NAME: '🤖 Status Assistant',
  BOT_VERSION: '1.0.0V',
  OWNER_NAME: '𝐊ᴇᴢᴜ𝚄 ||🌿 | ERANDA',
  IMAGE_PATH: 'https://files.catbox.moe/begcjv.png',
  BOT_FOOTER: '> *🤖 Status Assistant*',
  API_YTMP3_URL: 'https://ytmp3-download-api.vercel.app',
  API_YTMP4_URL: 'https://malmi-lakiya-api.vercel.app',
  BUTTON_IMAGES: { ALIVE: 'https://files.catbox.moe/begcjv.png' }
};
// ─────────── OWNER HELPER ───────────────────────
const isOwner = (num) => {
  const clean = (n) => (n || '').replace(/[^0-9]/g, '');
  return config.OWNER_NUMBER.split(',').map(clean).includes(clean(num));
};
// ---------------- MONGO SETUP ----------------
// ────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;//DB url eka .env eke dan thiyenne
const MONGO_DB = process.env.MONGO_DB;//mekatth ekema
let mongoClient, mongoDB;
let sessionsCol, numbersCol, adminsCol, newsletterCol, configsCol, newsletterReactsCol, groupSettingsCol, autoTTSendCol, autoSongSendCol;
// ────────────────────────────────────────────────
// In-memory cache for user configs to avoid frequent DB reads
const userConfigCache = new Map();
const USER_CONFIG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (reduced from 30)
const USER_CONFIG_CACHE_MAX = 100; // max entries to prevent unbounded growth

// In-memory cache for group settings
const groupSettingsCache = new Map();
const GROUP_SETTINGS_CACHE_TTL = 8 * 60 * 1000; // 8 minutes (reduced from 15)
const GROUP_SETTINGS_CACHE_MAX = 200; // max entries

let _mongoReady = false;
async function initMongo() {
  if (_mongoReady) return;
  try {
    if (mongoClient && mongoClient.topology && mongoClient.topology.isConnected && mongoClient.topology.isConnected()) { _mongoReady = true; return; }
  } catch(e){}
  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  mongoDB = mongoClient.db(MONGO_DB);

  sessionsCol = mongoDB.collection('sessions');
  numbersCol = mongoDB.collection('numbers');
  adminsCol = mongoDB.collection('admins');
  newsletterCol = mongoDB.collection('newsletter_list');
  configsCol = mongoDB.collection('configs');
  newsletterReactsCol = mongoDB.collection('newsletter_reacts');
  groupSettingsCol = mongoDB.collection('group_settings');
  autoTTSendCol = mongoDB.collection('autottsend');
  autoSongSendCol = mongoDB.collection('autosongsend');

  await sessionsCol.createIndex({ number: 1 }, { unique: true });
  await numbersCol.createIndex({ number: 1 }, { unique: true });
  await newsletterCol.createIndex({ jid: 1 }, { unique: true });
  await newsletterReactsCol.createIndex({ jid: 1 }, { unique: true });
  await configsCol.createIndex({ number: 1 }, { unique: true });
  await groupSettingsCol.createIndex({ jid: 1 }, { unique: true });
  await autoTTSendCol.createIndex({ number: 1, jid: 1 }, { unique: true });
  await autoSongSendCol.createIndex({ number: 1, jid: 1 }, { unique: true });
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
          const content = fs.readFileSync(path.join(sessionPath, fname), 'utf8');
          files[fname] = content;
        } catch(e) {}
      }
    }
    const doc = { number: sanitized, creds, keys, files, updatedAt: new Date() };
    await sessionsCol.updateOne({ number: sanitized }, { $set: doc }, { upsert: true });
    console.log(`Saved creds to Mongo for ${sanitized}`);
  } catch (e) { console.error('saveCredsToMongo error:', e); }
}

async function loadCredsFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    const doc = await sessionsCol.findOne({ number: sanitized });
    return doc || null;
  } catch (e) { console.error('loadCredsFromMongo error:', e); return null; }
}

async function removeSessionFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await sessionsCol.deleteOne({ number: sanitized });
    console.log(`Removed session from Mongo for ${sanitized}`);
  } catch (e) { console.error('removeSessionToMongo error:', e); }
}

async function addNumberToMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.updateOne({ number: sanitized }, { $set: { number: sanitized } }, { upsert: true });
    console.log(`Added number ${sanitized} to Mongo numbers`);
  } catch (e) { console.error('addNumberToMongo', e); }
}

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
    console.log(`Removed number ${sanitized} from Mongo numbers`);
  } catch (e) { console.error('removeNumberFromMongo', e); }
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { console.error('getAllNumbersFromMongo', e); return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { console.error('loadAdminsFromMongo', e); return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    const doc = { jid: jidOrNumber };
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: doc }, { upsert: true });
    console.log(`Added admin ${jidOrNumber}`);
  } catch (e) { console.error('addAdminToMongo', e); }
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
    console.log(`Removed admin ${jidOrNumber}`);
  } catch (e) { console.error('removeAdminFromMongo', e); }
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
    console.log(`Added newsletter ${jid} -> emojis: ${doc.emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterToMongo', e); throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
    console.log(`Removed newsletter ${jid}`);
  } catch (e) { console.error('removeNewsletterFromMongo', e); throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { console.error('listNewslettersFromMongo', e); return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    const col = mongoDB.collection('newsletter_reactions_log');
    await col.insertOne(doc);
    console.log(`Saved reaction ${emoji} for ${jid}#${messageId}`);
  } catch (e) { console.error('saveNewsletterReaction', e); }
}

async function setUserConfigInMongo(number, conf) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await configsCol.updateOne({ number: sanitized }, { $set: { number: sanitized, config: conf, updatedAt: new Date() } }, { upsert: true });
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
  } catch (e) { console.error('setUserConfigInMongo', e); }
}

async function loadUserConfigFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    // Check cache first
    try {
      const cached = userConfigCache.get(sanitized);
      if (cached && (Date.now() - (cached.ts || 0) < USER_CONFIG_CACHE_TTL)) {
        return cached.config;
      }
    } catch (e) { }

    const doc = await configsCol.findOne({ number: sanitized });
    const conf = doc ? doc.config : null;
    try { userConfigCache.set(sanitized, { config: conf, ts: Date.now() }); } catch (e){}
    return conf;
  } catch (e) { console.error('loadUserConfigFromMongo', e); return null; }
}

// -------------- newsletter react-config helpers --------------

async function addNewsletterReactConfig(jid, emojis = ['🎀','🧚‍♀️','🎭']) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
    console.log(`Added react-config for ${jid} -> ${emojis.join(',')}`);
  } catch (e) { console.error('addNewsletterReactConfig', e); throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
    console.log(`Removed react-config for ${jid}`);
  } catch (e) { console.error('removeNewsletterReactConfig', e); throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : ['🤫','♥️',''] }));
  } catch (e) { console.error('listNewsletterReactsFromMongo', e); return ['🤫','♥️','']; }
}

async function getReactConfigForJid(jid) {
  try {
    await initMongo();
    const doc = await newsletterReactsCol.findOne({ jid });
    return doc ? (Array.isArray(doc.emojis) ? doc.emojis : ['🧚‍♀️','🤫','🎀']) : null;
  } catch (e) { console.error('getReactConfigForJid', e); return null; }
}

// ─── Group Settings Helpers ──────────────────────────────────────────────────

async function getAllGroupSettings(groupJid) {
  try {
    const cached = groupSettingsCache.get(groupJid);
    if (cached && (Date.now() - cached.ts < GROUP_SETTINGS_CACHE_TTL)) return cached.settings;
    await initMongo();
    const doc = await groupSettingsCol.findOne({ jid: groupJid });
    const settings = doc ? (doc.settings || {}) : {};
    groupSettingsCache.set(groupJid, { settings, ts: Date.now() });
    return settings;
  } catch(e) { return {}; }
}

async function setGroupSetting(groupJid, key, value) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid: groupJid }, { $set: { [`settings.${key}`]: value, updatedAt: new Date() } }, { upsert: true });
    groupSettingsCache.delete(groupJid); // invalidate cache
  } catch(e) { console.error('setGroupSetting error:', e); }
}

async function setAllGroupSettings(groupJid, settings) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid: groupJid }, { $set: { jid: groupJid, settings, updatedAt: new Date() } }, { upsert: true });
    groupSettingsCache.delete(groupJid);
  } catch(e) { console.error('setAllGroupSettings error:', e); }
}

// ─── AutoTTSend Mongo Helpers ─────────────────────────────────────────────────

async function addAutoTTSend(number, jid, title, intervalMinutes = 10) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
    console.log(`AutoTTSend added: ${sanitized} → ${jid} [${title}] every ${intervalMinutes}min`);
  } catch(e) { console.error('addAutoTTSend error:', e); }
}

async function removeAutoTTSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.deleteMany({ number: sanitized });
    console.log(`AutoTTSend removed for ${sanitized}`);
  } catch(e) { console.error('removeAutoTTSend error:', e); }
}

async function getAutoTTSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoTTSendCol.find({ number: sanitized }).toArray();
  } catch(e) { console.error('getAutoTTSendConfigs error:', e); return []; }
}

// ─── AutoSongSend Mongo Helpers ───────────────────────────────────────────────

async function addAutoSongSend(number, jid, title, intervalMinutes = 30) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
    console.log(`AutoSongSend added: ${sanitized} → ${jid} [${title}] every ${intervalMinutes}min`);
  } catch(e) { console.error('addAutoSongSend error:', e); }
}

async function removeAutoSongSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.deleteMany({ number: sanitized });
    console.log(`AutoSongSend removed for ${sanitized}`);
  } catch(e) { console.error('removeAutoSongSend error:', e); }
}

async function getAutoSongSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoSongSendCol.find({ number: sanitized }).toArray();
  } catch(e) { console.error('getAutoSongSendConfigs error:', e); return []; }
}

// ---------------- basic utils ----------------

function formatMessage(title, content, footer) {
  return `*${title}*\n\n${content}\n\n> *${footer}*`;
}
function generateOTP(){ return Math.floor(100000 + Math.random() * 900000).toString(); }
function getSriLankaTimestamp(){ return moment().tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss'); }


const activeSockets = new Map();

const socketCreationTime = new Map();

const reconnectRetries = new Map();
const conflictRetries = new Map();    // separate counter for conflict (440) backoff

const reconnectInProgress = new Set(); // prevents double-reconnect race

const otpStore = new Map();

const intentionallyClosedNumbers = new Set();

// ─── Per-number message rate limiter (ban prevention) ─────────────────────────
const _msgRateLimiter = new Map(); // number → { count, resetAt }
const MSG_RATE_LIMIT = 25;        // max messages per minute per number
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

// ─── Human-like jitter before sending (ban prevention) ────────────────────────
function _humanDelay(minMs = 300, maxMs = 900) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

// ─── Anti-Delete Message Cache ────────────────────────────────────────────────
const messageDeleteCache = new Map(); // key: msgId, value: { from, sender, type, content }
const MESSAGE_CACHE_LIMIT = 50;

// AutoTTSend: intervalId keyed by "number:jid"
const autoTTSendIntervals = new Map();

// ─── Spam tracker (module-level, not re-created per message) ──────────────────
const _spamTracker = new Map();
// Clean up stale spam tracker entries every 2 minutes to prevent memory leak
setInterval(() => {
  const _cutoff = Date.now() - 30000;
  for (const [key, times] of _spamTracker.entries()) {
    if (!times.some(t => t > _cutoff)) _spamTracker.delete(key);
  }
}, 2 * 60 * 1000);

// Clean up stale caches every 5 min + enforce max size to prevent RAM bloat
setInterval(() => {
  const _now = Date.now();
  for (const [key, val] of userConfigCache.entries()) {
    if (!val.ts || (_now - val.ts) > USER_CONFIG_CACHE_TTL) userConfigCache.delete(key);
  }
  for (const [key, val] of groupSettingsCache.entries()) {
    if (!val.ts || (_now - val.ts) > GROUP_SETTINGS_CACHE_TTL) groupSettingsCache.delete(key);
  }
  // Enforce max sizes — evict oldest entries first
  if (userConfigCache.size > USER_CONFIG_CACHE_MAX) {
    const overflow = userConfigCache.size - USER_CONFIG_CACHE_MAX;
    let i = 0;
    for (const key of userConfigCache.keys()) { userConfigCache.delete(key); if (++i >= overflow) break; }
  }
  if (groupSettingsCache.size > GROUP_SETTINGS_CACHE_MAX) {
    const overflow = groupSettingsCache.size - GROUP_SETTINGS_CACHE_MAX;
    let i = 0;
    for (const key of groupSettingsCache.keys()) { groupSettingsCache.delete(key); if (++i >= overflow) break; }
  }
  // Clean up msg rate limiter entries that have expired
  const _now2 = Date.now();
  for (const [key, val] of _msgRateLimiter.entries()) {
    if (val.resetAt && _now2 > val.resetAt + 60000) _msgRateLimiter.delete(key);
  }
}, 5 * 60 * 1000);

// ─── Auto Voice reply map (module-level constant, not re-created per message) ─
const _VOICE_REPLIES = {
  'gm':              'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',
  'good morning':    'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/gm.ogg',
  'gn':              'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/gn.mp3',
  'good night':      'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/good%20night.mp3',
  'hi':              'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hey':             'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hello':           'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'helo':            'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hy':              'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'bye':             'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bye%20lassana%20lamayo.ogg',
  'hm':              'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hm.ogg',
  'mk':              'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/mk.ogg',
  'mokada karanne':  'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/mk.ogg',
  'adareyi':         'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
  'ආදරෙයි':         'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
  'love you':        'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
  'i love you':      'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/adarei.mp3',
  'ha ha':           'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/hako.mp3',
  'hako':            'https://github.com/TECH-HORIZON-SCHOOL-OFFICIAL/PROJECT_HORIZON/raw/refs/heads/main/voice%20clips/hako.mp3',
  'bot':             'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/hi%20lassana%20lamayo.ogg',
  'hutta':           'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'pakaya':          'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'ponnaya':         'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'utta':            'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'ponz':            'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'wesigeputha':     'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'huttigeputha':    'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'huththa':         'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg',
  'huththigeputha':  'https://raw.githubusercontent.com/dct-dula/database/48c3556468d3f7f81ce6b4ec974a83f2aea1b467/voice/bad%20words.ogg'
};

async function sendAutoTTVideo(socket, jid, title, botName) {
  try {
    const axios = require('axios');
    const searchParams = new URLSearchParams({ keywords: title, count: '20', cursor: '0', HD: '1' });
    const response = await axios.post('https://tikwm.com/api/feed/search', searchParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': 'current_language=en', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const videos = response.data?.data?.videos;
    if (!videos || videos.length === 0) return;
    const v = videos[Math.floor(Math.random() * videos.length)];
    // Prefer no-watermark HD, then play, then download
    const videoUrl = v.hdplay || v.play || v.wmplay || v.download;
    if (!videoUrl) return;
    const videoRes = await axios.get(videoUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.tiktok.com/',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8'
      },
      timeout: 90000
    });
    const videoBuffer = Buffer.from(videoRes.data);
    if (!videoBuffer || videoBuffer.length < 10000) {
      console.warn(`AutoTTSend: video buffer too small (${videoBuffer?.length} bytes), skipping`);
      return;
    }
    // Verify it starts with valid video bytes (mp4 ftyp box or other video signature)
    const hex = videoBuffer.slice(4, 8).toString('ascii');
    const isValidMp4 = hex === 'ftyp' || hex === 'moov' || hex === 'mdat' || hex === 'free';
    const caption = `*🍃 POWERED BY NATURE FOREVER*\n\n📌 *${v.title || title}*\n🥷 *${v.author?.nickname || 'Unknown'}*\n> *Kezu||🍃*`;
    if (jid.endsWith('@newsletter')) {
      // For channels, send video with proper mimetype
      await socket.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption
      });
    } else {
      await socket.sendMessage(jid, {
        video: videoBuffer,
        mimetype: 'video/mp4',
        caption,
        gifPlayback: false
      });
    }
    console.log(`AutoTTSend sent to ${jid} [${title}] (${Math.round(videoBuffer.length/1024)}KB)`);
  } catch(e) { console.error('AutoTTSend send error:', e.message); }
}

function startAutoTTSendInterval(socket, number, jid, title, botName, intervalMinutes = 10) {
  const key = `${number}:${jid}`;
  if (autoTTSendIntervals.has(key)) {
    clearInterval(autoTTSendIntervals.get(key));
  }
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoTTVideo(socket, jid, title, botName), ms);
  autoTTSendIntervals.set(key, id);
  console.log(`AutoTTSend interval started: ${key} every ${intervalMinutes}min`);
}

function stopAllAutoTTSend(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoTTSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoTTSendIntervals.delete(key);
      console.log(`AutoTTSend stopped: ${key}`);
    }
  }
}

// ─── AutoSongSend: interval functions ─────────────────────────────────────────

const autoSongSendIntervals = new Map();

async function sendAutoSong(socket, jid, title, botName) {
  try {
    const result = await yts(title);
    if (!result.videos || result.videos.length === 0) return;
    const data = result.videos[0];
    const videoId = data.videoId;
    const apiUrl = `${config.API_YTMP3_URL}/api/ytmp3?url=https://youtu.be/${videoId}`;
    const res = await axios.get(apiUrl, { timeout: 25000 });
    if (res.data.status !== 'success') return;
    const downloadLink = res.data.data.download_url;
    const songTitle = res.data.data.title || data.title;
    const duration = data.duration?.timestamp || data.duration?.toString() || 'Unknown';
    const channelName = data.author?.name || data.author || 'Unknown';
    const thumbnailUrl = data.thumbnail || data.image || null;

    // ── Step 1: Send Banner + Details ──
    const bannerCaption =
      `🎵 *NOW PLAYING*\n\n` +
      `📌 *Title:* ${songTitle}\n` +
      `🎤 *Artist:* ${channelName}\n` +
      `⏱️ *Duration:* ${duration}\n` +
      `▶️ *Views:* ${data.views ? data.views.toLocaleString() : 'N/A'}\n\n` +
      `> *© ${botName || BOT_NAME_FANCY}*`;

    try {
      if (thumbnailUrl) {
        await socket.sendMessage(jid, {
          image: { url: thumbnailUrl },
          caption: bannerCaption
        });
      } else {
        await socket.sendMessage(jid, { text: bannerCaption });
      }
    } catch(bannerErr) {
      console.warn('AutoSongSend banner error:', bannerErr.message);
    }

    await delay(1500);

    // ── Step 2: Send Audio ──
    await socket.sendMessage(jid, {
      audio: { url: downloadLink },
      mimetype: 'audio/mpeg',
      fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
    });
    console.log(`AutoSongSend sent to ${jid} [${songTitle}]`);
  } catch(e) { console.error('AutoSongSend send error:', e.message); }
}

function startAutoSongInterval(socket, number, jid, title, botName, intervalMinutes = 30) {
  const key = `${number}:${jid}`;
  if (autoSongSendIntervals.has(key)) {
    clearInterval(autoSongSendIntervals.get(key));
  }
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoSong(socket, jid, title, botName), ms);
  autoSongSendIntervals.set(key, id);
  console.log(`AutoSongSend interval started: ${key} every ${intervalMinutes}min`);
}

function stopAutoSongForNumber(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoSongSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoSongSendIntervals.delete(key);
      console.log(`AutoSongSend stopped: ${key}`);
    }
  }
}

// ---------------- helpers kept/adapted ----------------

async function joinGroup(socket) {
  let retries = config.MAX_RETRIES;
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  const inviteCode = inviteCodeMatch[1];
  while (retries > 0) {
    try {
      const response = await socket.groupAcceptInvite(inviteCode);
      if (response?.gid) return { status: 'success', gid: response.gid };
      throw new Error('No group ID in response');
    } catch (error) {
      retries--;
      let errorMessage = error.message || 'Unknown error';
      if (error.message && error.message.includes('not-authorized')) errorMessage = 'Bot not authorized';
      else if (error.message && error.message.includes('conflict')) errorMessage = 'Already a member';
      else if (error.message && error.message.includes('gone')) errorMessage = 'Invite invalid/expired';
      if (retries === 0) return { status: 'failed', error: errorMessage };
      await delay(2000 * (config.MAX_RETRIES - retries));
    }
  }
  return { status: 'failed', error: 'Max retries reached' };
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 𝐎𝚃𝙿 𝐕𝙴𝚁𝙸𝙵𝙸𝙲𝙰𝚃𝙸𝙾𝙽 — ${BOT_NAME_FANCY}*`, `*𝐘𝙾𝚄𝚁 𝐎𝚃𝙿 𝐅𝙾𝚁 𝐂𝙾𝙽𝙵𝙸𝙶 𝐔𝙿𝙳𝙰𝚃𝙴 𝐈𝚂:* *${otp}*\n𝐓𝙷𝙸𝚂 𝐎𝚃𝙿 𝐖𝙸𝙻𝙻 𝐄𝚇𝙿𝙸𝚁𝙴 𝐈𝙽 5 𝐌𝙸𝙽𝚄𝚃𝙴𝚂.\n\n*𝐍𝚄𝙼𝙱𝙴𝚁:* ${number}`, BOT_NAME_FANCY);
  try { await socket.sendMessage(userJid, { text: message }); console.log(`OTP ${otp} sent to ${number}`); }
  catch (error) { console.error(`Failed to send OTP to ${number}:`, error); throw error; }
}

// ---------------- handlers (newsletter + reactions) ----------------

async function setupNewsletterHandlers(socket, sessionNumber) {
  const rrPointers = new Map();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;

    // Only newsletter JIDs have this suffix — skip DB reads for regular chats
    if (!jid || !jid.endsWith('@newsletter')) return;

    try {
      const [followedDocs, reactConfigs] = await Promise.all([
        listNewslettersFromMongo(),
        listNewsletterReactsFromMongo()
      ]);
      const reactMap = new Map();
      for (const r of reactConfigs) reactMap.set(r.jid, r.emojis || []);

      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid) && !reactMap.has(jid)) return;

      let emojis = reactMap.get(jid) || null;
      if ((!emojis || emojis.length === 0) && followedDocs.find(d => d.jid === jid)) {
        emojis = (followedDocs.find(d => d.jid === jid).emojis || []);
      }
      if (!emojis || emojis.length === 0) emojis = config.AUTO_LIKE_EMOJI;

      let idx = rrPointers.get(jid) || 0;
      const emoji = emojis[idx % emojis.length];
      rrPointers.set(jid, (idx + 1) % emojis.length);

      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      let retries = 3;
      while (retries-- > 0) {
        try {
          if (typeof socket.newsletterReactMessage === 'function') {
            await socket.newsletterReactMessage(jid, messageId.toString(), emoji);
          } else {
            await socket.sendMessage(jid, { react: { text: emoji, key: message.key } });
          }
          console.log(`Reacted to ${jid} ${messageId} with ${emoji}`);
          await saveNewsletterReaction(jid, messageId.toString(), emoji, sessionNumber || null);
          break;
        } catch (err) {
          console.warn(`Reaction attempt failed (${3 - retries}/3):`, err?.message || err);
          await delay(1200);
        }
      }

    } catch (error) {
      console.error('Newsletter reaction handler error:', error?.message || error);
    }
  });
}


// ---------------- status + revocation + resizing ----------------

// ─── Seen-status dedup cache to avoid double-processing ──────────────────────
const _seenStatusIds = new Set();
setInterval(() => { if (_seenStatusIds.size > 500) _seenStatusIds.clear(); }, 10 * 60 * 1000);

// Helper: extract all text from any status message type
function _extractStatusText(message) {
  const m = message.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.extendedTextMessage?.matchedText ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsMessage?.contentText ||
    m.listMessage?.description || ''
  ).trim();
}

// Helper: detect any URL/link in text
const _ANY_LINK_REGEX = /(?:https?:\/\/|wa\.me\/|chat\.whatsapp\.com\/)[^\s]*/gi;
const _WAME_REGEX = /(?:https?:\/\/)?wa\.me\/(\+?[0-9]{7,15})/gi;

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    // Dedup: skip if already processed this status message
    const _statusMsgId = message.key.id;
    if (_seenStatusIds.has(_statusMsgId)) return;
    _seenStatusIds.add(_statusMsgId);

    try {
      // ── Load config ONCE for this session ───────────────────────
      const userCfg = sessionNumber ? (await loadUserConfigFromMongo(sessionNumber) || {}) : {};

      const userEmojis = (Array.isArray(userCfg.AUTO_LIKE_EMOJI) && userCfg.AUTO_LIKE_EMOJI.length > 0)
        ? userCfg.AUTO_LIKE_EMOJI : config.AUTO_LIKE_EMOJI;
      const autoViewStatus  = userCfg.AUTO_VIEW_STATUS  ?? config.AUTO_VIEW_STATUS;
      const autoLikeStatus  = userCfg.AUTO_LIKE_STATUS  ?? config.AUTO_LIKE_STATUS;
      const autoRecording   = userCfg.AUTO_RECORDING    ?? config.AUTO_RECORDING;
      const autoStatusSave  = userCfg.AUTO_STATUS_SAVE  || 'false';
      const linkScanEnabled = userCfg.LINK_SCAN         ?? 'true';
      // AUTO_STATUS_REPLY: reply to the status poster when their status contains any link
      const autoStatusReply = userCfg.AUTO_STATUS_REPLY || 'false';
      const botName         = userCfg.botName           || BOT_NAME_FANCY;

      const posterJid = message.key.participant;
      const posterNum = posterJid.split('@')[0];

      // ── Auto Recording ──────────────────────────────────────────
      if (autoRecording === 'true') {
        try { await socket.sendPresenceUpdate('recording', message.key.remoteJid); } catch(e) {}
      }

      // ── Auto View Status ────────────────────────────────────────
      if (autoViewStatus === 'true') {
        try { await socket.readMessages([message.key]); } catch(e) {}
      }

      // ── Auto Like Status ────────────────────────────────────────
      if (autoLikeStatus === 'true') {
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];
        try {
          const _botJid = socket.user?.id?.includes(':')
            ? socket.user.id.split(':')[0] + '@s.whatsapp.net'
            : socket.user?.id;
          await socket.sendMessage('status@broadcast', {
            react: { text: randomEmoji, key: message.key }
          }, { statusJidList: [posterJid, _botJid].filter(Boolean) });
        } catch(e) { console.error('[STATUS REACT]', e.message); }
      }

      // ── Auto Status Save ────────────────────────────────────────
      if (autoStatusSave === 'true') {
        try {
          const msgContent = message.message;
          let mediaType = null;
          let mediaMsg = null;
          if (msgContent?.imageMessage) { mediaType = 'image'; mediaMsg = msgContent.imageMessage; }
          else if (msgContent?.videoMessage) { mediaType = 'video'; mediaMsg = msgContent.videoMessage; }

          if (mediaType && mediaMsg) {
            const stream = await downloadContentFromMessage(mediaMsg, mediaType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            const captionText = mediaMsg.caption || '';
            const botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
            const saveCaption = `📥 *Status Saved*\n👤 *From:* +${posterNum}${captionText ? `\n📝 *Caption:* ${captionText}` : ''}\n\n> _Auto-saved by 🤖 Status Assistant_`;
            if (mediaType === 'image') {
              await socket.sendMessage(botJid, { image: buffer, caption: saveCaption });
            } else {
              await socket.sendMessage(botJid, { video: buffer, caption: saveCaption });
            }
            console.log(`[STATUS SAVE] Saved status from ${posterNum}`);
          }
        } catch (ssErr) {
          console.error('[STATUS SAVE] Error:', ssErr.message);
        }
      }

      // ── Status Link Detect & Reply ───────────────────────────────
      // Extract text from the status (all message types)
      const statusText = _extractStatusText(message);

      if (statusText) {
        // 1. wa.me link scanner: message the NUMBER found in the link
        if (linkScanEnabled === 'true') {
          try {
            _WAME_REGEX.lastIndex = 0;
            const foundNumbers = [];
            let wMatch;
            while ((wMatch = _WAME_REGEX.exec(statusText)) !== null) {
              const phoneNumber = wMatch[1].replace(/\D/g, '');
              if (phoneNumber && phoneNumber.length >= 7 && !foundNumbers.includes(phoneNumber)) {
                foundNumbers.push(phoneNumber);
              }
            }
            if (foundNumbers.length > 0) {
              const ownerNum = (sessionNumber || config.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
              const ownerJid = ownerNum ? `${ownerNum}@s.whatsapp.net` : null;
              const botJid = socket.user?.id ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : null;
              const ownerName = userCfg.ownerName || config.OWNER_NAME || 'Owner';

              for (const num of foundNumbers) {
                try {
                  const targetJid = `${num}@s.whatsapp.net`;
                  const mentionList = [targetJid];
                  if (ownerJid && ownerJid !== targetJid) mentionList.push(ownerJid);

                  await socket.sendMessage(targetJid, {
                    text: `*👋 Hello @${num}!*\n\nI noticed your WhatsApp link in a status update 👀\n\nI'm *${botName}* — managed by @${ownerNum} *(${ownerName})* 🌿\n\nFeel free to reach out anytime! 😊\n\n> _Automated message from Status Assistant_`,
                    mentions: mentionList
                  });
                  console.log(`[LINK SCAN] Messaged: ${num}`);
                } catch (e) {
                  console.error(`[LINK SCAN] Failed to message ${num}:`, e.message);
                }
              }
            }
          } catch (lsErr) {
            console.error('[LINK SCAN] Error:', lsErr.message);
          }
        }

        // 2. AUTO_STATUS_REPLY: reply directly to the poster's status when it has any link
        if (autoStatusReply === 'true') {
          try {
            _ANY_LINK_REGEX.lastIndex = 0;
            const hasLink = _ANY_LINK_REGEX.test(statusText);
            if (hasLink) {
              const replyText = userCfg.STATUS_REPLY_MSG ||
                `*👋 Hey!*\n\nI saw your status with a link 🔗\n\nI'm *${botName}* — feel free to contact me anytime! 😊\n\n> _Auto-reply by Status Assistant_`;
              await socket.sendMessage(posterJid, { text: replyText });
              console.log(`[STATUS REPLY] Replied to ${posterNum} for link in status`);
            }
          } catch (srErr) {
            console.error('[STATUS REPLY] Error:', srErr.message);
          }
        }
      }

    } catch (error) {
      console.error('Status handler error:', error?.message || error);
    }
  });
}


async function handleMessageRevocation(socket, number) {
  socket.ev.on('messages.delete', async ({ keys }) => {
    if (!keys || keys.length === 0) return;
    try {
      const sanitized = (number || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      if (userConfig.ANTI_DELETE !== 'on') return;

      const userJid = jidNormalizedUser(socket.user.id);
      const deletionTime = getSriLankaTimestamp();

      for (const messageKey of keys) {
        const cached = messageDeleteCache.get(messageKey.id);
        if (!cached) {
          const notif = `🗑️ *Anti Delete*\nA message was deleted.\n*From:* ${messageKey.remoteJid}\n*Time:* ${deletionTime}`;
          try { await socket.sendMessage(userJid, { text: notif }); } catch(e){}
          continue;
        }

        const { from, senderNum, text, imageBuffer, videoBuffer, audioBuffer, stickerBuffer, docBuffer, caption, mimeType, fileName } = cached;
        const header = `🗑️ *Anti Delete* — Message deleted from @${senderNum} in ${from}\n🕐 *Time:* ${deletionTime}\n\n`;

        try {
          if (imageBuffer) {
            await socket.sendMessage(userJid, { image: imageBuffer, caption: header + (caption || '') });
          } else if (videoBuffer) {
            await socket.sendMessage(userJid, { video: videoBuffer, caption: header + (caption || '') });
          } else if (audioBuffer) {
            await socket.sendMessage(userJid, { audio: audioBuffer, mimetype: mimeType || 'audio/mpeg', ptt: false });
            await socket.sendMessage(userJid, { text: header });
          } else if (stickerBuffer) {
            await socket.sendMessage(userJid, { sticker: stickerBuffer });
            await socket.sendMessage(userJid, { text: header });
          } else if (docBuffer) {
            await socket.sendMessage(userJid, { document: docBuffer, mimetype: mimeType || 'application/octet-stream', fileName: fileName || 'file' });
            await socket.sendMessage(userJid, { text: header });
          } else if (text) {
            await socket.sendMessage(userJid, { text: header + text });
          } else {
            await socket.sendMessage(userJid, { text: header + '(Media message deleted)' });
          }
        } catch(e) { console.error('AntiDelete resend error:', e); }
      }
    } catch (error) {
      console.error('handleMessageRevocation error:', error);
    }
  });
}


async function resize(image, width, height) {
  let oyy = await Jimp.read(image);
  return await oyy.resize(width, height).getBufferAsync(Jimp.MIME_JPEG);
}


// ---------------- command handlers ----------------

function setupCommandHandlers(socket, number) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    const type = getContentType(msg.message);
    if (!msg.message) return;
    msg.message = (getContentType(msg.message) === 'ephemeralMessage') ? msg.message.ephemeralMessage.message : msg.message;

    const from = msg.key.remoteJid;
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net' || socket.user.id) : (msg.key.participant || msg.key.remoteJid);
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isBotOrOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");


    let body = '';
    try {
      if (type === 'conversation') {
        body = msg.message.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = msg.message.extendedTextMessage?.text || '';
      } else if (type === 'interactiveResponseMessage') {
        try {
          body = JSON.parse(msg.message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson || '{}')?.id || '';
        } catch(e) { body = ''; }
      } else if (type === 'templateButtonReplyMessage') {
        body = msg.message.templateButtonReplyMessage?.selectedId || '';
      } else if (type === 'buttonsResponseMessage') {
        body = msg.message.buttonsResponseMessage?.selectedButtonId || '';
      } else if (type === 'listResponseMessage') {
        body = msg.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
      } else if (type === 'imageMessage') {
        body = msg.message.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = msg.message.videoMessage?.caption || '';
      } else if (type === 'messageContextInfo') {
        body = msg.message.buttonsResponseMessage?.selectedButtonId
          || msg.message.listResponseMessage?.singleSelectReply?.selectedRowId
          || '';
      } else if (type === 'viewOnceMessage') {
        try {
          const voType = getContentType(msg.message[type]?.message);
          body = msg.message[type]?.message?.[voType]?.caption || '';
        } catch(e) { body = ''; }
      }
    } catch(e) { body = ''; }
    body = String(body || '').trim();

    if (!body) return;

    const prefix = config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

    // ── Pre-load config ONCE per message (avoids repeated DB reads) ──────────
    const _preSan = (number || '').replace(/[^0-9]/g, '');
    // Fast cache-first pre-load: group settings only fetched for group messages
    const _ucCached = userConfigCache.get(_preSan);
    const _preUC = (_ucCached && (Date.now() - (_ucCached.ts || 0) < USER_CONFIG_CACHE_TTL))
      ? _ucCached.config || {}
      : await loadUserConfigFromMongo(_preSan).then(c => c || {}).catch(() => ({}));

    const _gcCached = isGroup ? groupSettingsCache.get(from) : null;
    const _preGS = isGroup
      ? ((_gcCached && (Date.now() - (_gcCached.ts || 0) < GROUP_SETTINGS_CACHE_TTL))
          ? _gcCached.settings || {}
          : await getAllGroupSettings(from).catch(() => ({})))
      : {};

    // helper: download quoted media into buffer
    async function downloadQuotedMedia(quoted) {
      if (!quoted) return null;
      const qTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
      const qType = qTypes.find(t => quoted[t]);
      if (!qType) return null;
      const messageType = qType.replace(/Message$/i, '').toLowerCase();
      const stream = await downloadContentFromMessage(quoted[qType], messageType);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
      return {
        buffer,
        mime: quoted[qType].mimetype || '',
        caption: quoted[qType].caption || quoted[qType].fileName || '',
        ptt: quoted[qType].ptt || false,
        fileName: quoted[qType].fileName || ''
      };
    }

    // ─── Anti-Delete Message Caching (metadata only — no media buffers to save RAM) ─
    try {
      if (!msg.key.fromMe && _preUC.ANTI_DELETE === 'on') {
        const _msgId = msg.key.id;
        const _cType = getContentType(msg.message);
        // Only cache text and caption metadata — skip downloading media buffers (RAM saving)
        const _cacheEntry = {
          from,
          senderNum: (nowsender || '').split('@')[0],
          type: _cType,
          text: body || '',
          caption: msg.message?.[_cType]?.caption || '',
          fileName: msg.message?.[_cType]?.fileName || '',
          mimeType: msg.message?.[_cType]?.mimetype || ''
        };
        if (messageDeleteCache.size >= MESSAGE_CACHE_LIMIT) {
          const _firstKey = messageDeleteCache.keys().next().value;
          messageDeleteCache.delete(_firstKey);
        }
        messageDeleteCache.set(_msgId, _cacheEntry);
      }
    } catch(e) { console.log('Message cache error:', e); }

    // Auto Voice Feature — uses pre-loaded _preUC, module-level _VOICE_REPLIES
    try {
      if (!msg.key.fromMe && _preUC.AUTO_VOICE !== 'off') {
        const _voiceUrl = _VOICE_REPLIES[(body || '').trim().toLowerCase()];
        if (_voiceUrl) {
          await socket.sendMessage(sender, {
            audio: { url: _voiceUrl },
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
          }, { quoted: msg });
        }
      }
    } catch (e) {
      console.log("AutoVoice Error:", e);
    }

    // ─── Anti-Bug ────────────────────────────────────────────────────────────
    try {
      if (_preUC.ANTI_BUG === 'on' && !msg.key.fromMe && body !== undefined) {
        const _bugType = getContentType(msg.message);
        const _isBug = (body && body.length > 5000)
          || (_bugType === 'contactsArrayMessage')
          || (body && /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/.test(body));
        if (_isBug) {
          try { await socket.sendMessage(from, { delete: msg.key }); } catch(e){}
          await socket.sendMessage(from, { text: `🛡️ *Anti Bug Protection*\nA suspicious crash message was detected and removed.` });
          // ─── Auto Block if message is from Inbox (not a group) ───
          if (!isGroup) {
            try {
              await socket.updateBlockStatus(nowsender, 'block');
              const userJid = jidNormalizedUser(socket.user.id);
              await socket.sendMessage(userJid, { text: `🛡️ *Anti Bug — Auto Block*\n@${(nowsender||'').split('@')[0]} was automatically blocked for sending a crash message.`, mentions: [nowsender] });
            } catch(blockErr) { console.log('AntiBug auto-block error:', blockErr); }
          }
        }
      }
    } catch(e) { console.log('AntiBug error:', e); }

    // ─── Anti-Badword ────────────────────────────────────────────────────────
    try {
      if (_preUC.ANTI_BADWORD === 'on' && !msg.key.fromMe && body) {
        const _defaultBW = ['fuck','shit','bitch','asshole','bastard','dick','cunt','fag','hutta','pakaya','ponnaya','utta','ponz','wesigeputha','huttigeputha','huththa'];
        const _customBW = Array.isArray(_preUC.BAD_WORDS) ? _preUC.BAD_WORDS : [];
        const _allBW = [..._defaultBW, ..._customBW];
        const _bodyBW = body.toLowerCase();
        const _foundBW = _allBW.find(w => _bodyBW.includes(w.toLowerCase()));
        if (_foundBW) {
          try { await socket.sendMessage(from, { delete: msg.key }); } catch(e){}
          await socket.sendMessage(from, {
            text: `⚠️ *Anti Badword*\n@${(nowsender || '').split('@')[0]} bad words are not allowed here!`,
            mentions: [nowsender]
          });
        }
      }
    } catch(e) { console.log('AntiBadword error:', e); }

    // ─── Auto Reply ──────────────────────────────────────────────────────────
    try {
      if (_preUC.AUTO_REPLY === 'on' && !msg.key.fromMe && body) {
        const _replies = _preUC.AUTO_REPLIES || {};
        const _bodyAR = body.trim().toLowerCase();
        const _matched = _replies[_bodyAR] || _replies[body.trim()];
        if (_matched) {
          await socket.sendMessage(from, { text: _matched }, { quoted: msg });
        }
      }
    } catch(e) { console.log('AutoReply error:', e); }

    // ─── Anti-Link (Groups) ──────────────────────────────────────────────────
    try {
      if (isGroup && !msg.key.fromMe && body) {
        const _alEnabled = _preGS.ANTI_LINK;
        if (_alEnabled === 'on') {
          const _urlReg = /https?:\/\/[^\s]+|wa\.me\/[^\s]+|chat\.whatsapp\.com\/[^\s]+|bit\.ly\/[^\s]+|t\.me\/[^\s]+/i;
          if (_urlReg.test(body)) {
            let isAdminSender = false;
            try { const _meta = await socket.groupMetadata(from); isAdminSender = !!_meta.participants.find(p => p.id === nowsender && (p.admin === 'admin' || p.admin === 'superadmin')); } catch(e) {}
            if (!isAdminSender) {
              try { await socket.sendMessage(from, { delete: msg.key }); } catch(e) {}
              await socket.sendMessage(from, { text: `🔗 *Anti Link*\n@${(nowsender||'').split('@')[0]} was kicked for sending a link!`, mentions: [nowsender] });
              try { await socket.groupParticipantsUpdate(from, [nowsender], 'remove'); } catch(kickErr) { console.log('AntiLink kick error:', kickErr); }
            }
          }
        }
      }
    } catch(e) { console.log('AntiLink error:', e); }

    // ─── Anti-Spam (Groups) ──────────────────────────────────────────────────
    try {
      if (isGroup && !msg.key.fromMe) {
        const _asEnabled = _preGS.ANTI_SPAM;
        if (_asEnabled === 'on') {
          const _spamKey = `spam_${from}_${nowsender}`;
          const _now = Date.now();
          const _hist = _spamTracker.get(_spamKey) || [];
          const _recent = _hist.filter(t => _now - t < 5000);
          _recent.push(_now);
          _spamTracker.set(_spamKey, _recent);
          if (_recent.length >= 5) {
            let isAdminSender = false;
            try { const _meta = await socket.groupMetadata(from); isAdminSender = !!_meta.participants.find(p => p.id === nowsender && (p.admin === 'admin' || p.admin === 'superadmin')); } catch(e) {}
            if (!isAdminSender) {
              _spamTracker.delete(_spamKey);
              await socket.sendMessage(from, { text: `⚠️ *Anti Spam*\n@${(nowsender||'').split('@')[0]} slow down! You are spamming.`, mentions: [nowsender] });
            }
          }
        }
      }
    } catch(e) { console.log('AntiSpam error:', e); }

    // ─── Auto React ──────────────────────────────────────────────────────────
    try {
      if (_preUC.AUTO_REACT === 'on' && !msg.key.fromMe && body) {
        const _reactEmojis = [
          '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💗','💖','💝','💞',
          '😍','🥰','😘','🤩','😎','🥳','🤣','😂','👏','🙌','🔥','✨','💫',
          '⭐','🌟','💯','🎉','🎊','👀','😊','🥺','💪','🫶','👍','🫡','🌹'
        ];
        const _randomEmoji = _reactEmojis[Math.floor(Math.random() * _reactEmojis.length)];
        await socket.sendMessage(from, {
          react: { text: _randomEmoji, key: msg.key }
        }).catch(e => console.log('AutoReact error:', e));
      }
    } catch(e) { console.log('AutoReact handler error:', e); }

    if (!command) return;

    try {

      // Use pre-loaded config (no extra DB read needed)
      const sanitized = _preSan;
      const userConfig = _preUC;

      // ========== ADD WORK TYPE RESTRICTIONS HERE ==========
      // Apply work type restrictions for non-owner users
      if (!isBotOrOwner) {
        // Get work type from user config or fallback to global config
        const workType = userConfig.WORK_TYPE || 'public'; // Default to public if not set

        // If work type is "private", only owner can use commands
        if (workType === "private") {
          console.log(`Command blocked: WORK_TYPE is private for ${sanitized}`);
          return;
        }

        // If work type is "inbox", block commands in groups
        if (isGroup && workType === "inbox") {
          console.log(`Command blocked: WORK_TYPE is inbox but message is from group for ${sanitized}`);
          return;
        }

        // If work type is "groups", block commands in private chats
        if (!isGroup && workType === "groups") {
          console.log(`Command blocked: WORK_TYPE is groups but message is from private chat for ${sanitized}`);
          return;
        }

        // If work type is "public", allow all (no restrictions needed)
      }
      // ========== END WORK TYPE RESTRICTIONS ==========

      // ─── Per-number rate limit (ban prevention) ──────────────────────────
      if (!_checkRateLimit(_preSan)) {
        console.log(`[RATE LIMIT] ${_preSan} exceeded ${MSG_RATE_LIMIT} msg/min — throttling command.`);
        return;
      }

      // Command delay removed for speed

      switch (command) {
        // --- existing commands (deletemenumber, unfollow, newslist, admin commands etc.) ---
        // ... (keep existing other case handlers unchanged) ...

          case 'ts': {
    const axios = require('axios');

    const q = msg.message?.conversation ||
              msg.message?.extendedTextMessage?.text ||
              msg.message?.imageMessage?.caption ||
              msg.message?.videoMessage?.caption || '';

    let query = q.replace(/^[.\/!]ts\s*/i, '').trim();

    if (!query) {
        return await socket.sendMessage(sender, {
            text: '*❗ɢᴇᴛ ᴍᴇ ꜱᴏᴍᴇ ᴡᴏʀᴅ! 🔍*'
        }, { quoted: msg });
    }

    // 🔹 Load bot name dynamically
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '© 𝗦ᴛᴀᴛᴜꜱ 𝗔ꜱꜱɪꜱᴛᴀɴᴛ 👻';

    // 🔹 Fake contact for quoting
    const shonux = {
        key: {
            remoteJid: "status@broadcast",
            participant: "0@s.whatsapp.net",
            fromMe: false,
            id: "META_AI_FAKE_ID_TS"
        },
        message: {
            contactMessage: {
                displayName: botName,
                vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
            }
        }
    };

    try {
        await socket.sendMessage(sender, { text: `🔎 Searching TikTok for: ${query}...` }, { quoted: shonux });

        const searchParams = new URLSearchParams({ keywords: query, count: '10', cursor: '0', HD: '1' });
        const response = await axios.post("https://tikwm.com/api/feed/search", searchParams, {
            headers: { 'Content-Type': "application/x-www-form-urlencoded; charset=UTF-8", 'Cookie': "current_language=en", 'User-Agent': "Mozilla/5.0" }
        });

        const videos = response.data?.data?.videos;
        if (!videos || videos.length === 0) {
            return await socket.sendMessage(sender, { text: '⚠️ No videos found.' }, { quoted: shonux });
        }

        // Limit number of videos to send
        const limit = 3; 
        const results = videos.slice(0, limit);

        // 🔹 Send videos one by one
        for (let i = 0; i < results.length; i++) {
            const v = results[i];
            const videoUrl = v.play || v.download || null;
            if (!videoUrl) continue;

            await socket.sendMessage(sender, { text: `*⏳ Downloading:* ${v.title || 'No Title'}` }, { quoted: shonux });

            await socket.sendMessage(sender, {
                video: { url: videoUrl },
                caption: `*🎵 ${botName} 𝐓𝙸𝙺𝚃𝙾𝙺 𝐃𝙾𝚆𝙽𝙻𝙾𝙰𝙳𝙴𝚁*\n\n*𝐓itle: ${v.title || 'No Title'}.*\n*🩵𝐀𝚄𝚃𝙷𝙾𝚁:* ${v.author?.nickname || 'Unknown'}`
            }, { quoted: shonux });
        }

    } catch (err) {
        console.error('TikTok Search Error:', err);
        await socket.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: shonux });
    }

    break;
          }
          
          case 'jid': {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '© 𝗦ᴛᴀᴛᴜꜱ 𝗔ꜱꜱɪꜱᴛᴀɴᴛ'; // dynamic bot name

    const userNumber = sender.split('@')[0]; 

    // Reaction
    await socket.sendMessage(sender, { 
        react: { text: "👻", key: msg.key } 
    });

    // Fake contact quoting for meta style
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_FAKE_ID" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Meta Platforms\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, {
        text: `*✅ 𝐂hat 𝐉ID:* ${sender}\n*♻️ 𝐘our 𝐍umber:* +${userNumber}`,
    }, { quoted: shonux });
    break;
}

          case 'csong': {
    try {
        const axios = require('axios');
        const ffmpeg = require('fluent-ffmpeg');
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const crypto = require('crypto');

        ffmpeg.setFfmpegPath(ffmpegInstaller.path);

        const _chm_id = crypto.randomBytes(8).toString('hex');
        const targetJidInput = args[0];
        const songQuery = args.slice(1).join(" ").trim();

        if (!targetJidInput || !songQuery) {
            return await socket.sendMessage(from, { text: "❌ *Format Invalid!*\nUsage: `.csong <newsletter> <song name>`\nExample: `.csong . Shape of You`" }, { quoted: msg });
        }

        await socket.sendMessage(from, { react: { text: "🎧", key: msg.key } });
        await socket.sendMessage(from, { text: "⏳ *Searching & downloading...*" }, { quoted: msg });

        let sJid = targetJidInput;
        if (sJid === '.' || sJid.toLowerCase() === 'here') {
            sJid = from;
        } else if (!sJid.includes('@')) {
            if (/^\d{12,}$/.test(sJid)) sJid = `${sJid}@newsletter`;
            else sJid = `${sJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        }

        let videoId = null;
        let sMetadata = null;

        if (/^https?:\/\//i.test(songQuery)) {
            const match = songQuery.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            videoId = match ? match[1] : null;
            if (!videoId) return await socket.sendMessage(from, { text: "❌ *Invalid YouTube URL.*" }, { quoted: msg });
        } else {
            const yts = require('yt-search');
            const search = await yts(songQuery);
            if (!search || !search.videos || search.videos.length === 0) {
                return await socket.sendMessage(from, { text: "❌ No results found for: *" + songQuery + "*" }, { quoted: msg });
            }
            sMetadata = search.videos[0];
            videoId = sMetadata.videoId;
        }

        const sApiUrl = `https://vajira-official-apis.vercel.app/api/ytmp3?apikey=vajira-b72bv85884-1776138459299&url=https://youtu.be/${videoId}`;
        const sApiResp = await axios.get(sApiUrl, { timeout: 30000 }).catch(() => null);

        if (!sApiResp || !sApiResp.data || !sApiResp.data.status) {
            return await socket.sendMessage(from, { text: "❌ *API failed. Try again later.*" }, { quoted: msg });
        }

        const sApiData = sApiResp.data.data;
        const sTitle = sApiData.title || sMetadata?.title || 'Song';
        const sDuration = sApiData.timestamp || sMetadata?.timestamp || 'N/A';
        const sThumb = sApiData.thumbnails?.high || sApiData.thumbnails?.default || sMetadata?.thumbnail || null;

        const downloadObj = sApiData.downloads?.find(d => d.bitrate === '128kbps') || sApiData.downloads?.[0];
        if (!downloadObj || !downloadObj.url) {
            return await socket.sendMessage(from, { text: "❌ *No download link found.*" }, { quoted: msg });
        }

        const chm_Mp3 = path.join(os.tmpdir(), `csong_${_chm_id}.mp3`);
        const chm_Opus = path.join(os.tmpdir(), `csong_${_chm_id}.opus`);

        const dlResp = await axios.get(downloadObj.url, { responseType: 'stream', timeout: 120000 }).catch(() => null);
        if (!dlResp || !dlResp.data) {
            return await socket.sendMessage(from, { text: "❌ *Audio download failed. Try again later.*" }, { quoted: msg });
        }

        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(chm_Mp3);
            dlResp.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const sCaption = `☘️ *TITLE :* ${sTitle}\n` +
                         `◽️ ⏱ *Duration :* ${sDuration}\n\n` +
                         `> *© 𝗦ᴛᴀᴛᴜꜱ 𝗔ꜱꜱɪꜱᴛᴀɴᴛ*`;

        if (sThumb) {
            await socket.sendMessage(sJid, { image: { url: sThumb }, caption: sCaption });
        } else {
            await socket.sendMessage(sJid, { text: sCaption });
        }

        const chm_Buf = fs.readFileSync(chm_Mp3);
        await socket.sendMessage(sJid, {
            audio: chm_Buf,
             mimetype: 'audio/mpeg',
            fileName: `${sTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
        });

        if (sJid !== from) await socket.sendMessage(from, { text: `✅ *Song sent successfully!*\n🎵 ${sTitle}` }, { quoted: msg });

        try { if (fs.existsSync(chm_Mp3)) fs.unlinkSync(chm_Mp3); } catch(e){}

    } catch (e) {
        console.error('csong error:', e);
        await socket.sendMessage(from, { text: "❌ *csong Error:* " + e.message }, { quoted: msg });
    }
    break;
        }

          case 'cvid': {
    try {
        const axios = require('axios');
        const path = require('path');
        const os = require('os');
        const fs = require('fs');
        const crypto = require('crypto');

        const _cvid_id = crypto.randomBytes(8).toString('hex');
        const targetJidInput = args[0];
        const songQuery = args.slice(1).join(" ").trim();

        if (!targetJidInput || !songQuery) {
            return await socket.sendMessage(from, {
                text: "❌ *Format Invalid!*\nUsage: `.cvid <jid> <song/video name>`\nExample: `.cvid . Shape of You`"
            }, { quoted: msg });
        }

        await socket.sendMessage(from, { react: { text: "🎬", key: msg.key } });
        await socket.sendMessage(from, { text: "⏳ *Searching & downloading video...*" }, { quoted: msg });

        let sJid = targetJidInput;
        if (sJid === '.' || sJid.toLowerCase() === 'here') {
            sJid = from;
        } else if (!sJid.includes('@')) {
            if (/^\d{12,}$/.test(sJid)) sJid = `${sJid}@newsletter`;
            else sJid = `${sJid.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        }

        let videoId = null;
        let sMetadata = null;

        if (/^https?:\/\//i.test(songQuery)) {
            const match = songQuery.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            videoId = match ? match[1] : null;
            if (!videoId) return await socket.sendMessage(from, { text: "❌ *Invalid YouTube URL.*" }, { quoted: msg });
        } else {
            const yts = require('yt-search');
            const search = await yts(songQuery);
            if (!search || !search.videos || search.videos.length === 0) {
                return await socket.sendMessage(from, { text: "❌ No results found for: *" + songQuery + "*" }, { quoted: msg });
            }
            sMetadata = search.videos[0];
            videoId = sMetadata.videoId;
        }

        const sApiUrl = `https://vajira-official-apis.vercel.app/api/ytmp4?apikey=vajira-b72bv85884-1776138459299&url=https://youtu.be/${videoId}`;
        const sApiResp = await axios.get(sApiUrl, { timeout: 30000 }).catch(() => null);

        if (!sApiResp || !sApiResp.data || !sApiResp.data.status) {
            return await socket.sendMessage(from, { text: "❌ *API failed. Try again later.*" }, { quoted: msg });
        }

        const sMeta = sApiResp.data.metadata || {};
        const sVids = sApiResp.data.downloads?.video || [];
        const sTitle = sMeta.title || sMetadata?.title || 'Video';
        const sDuration = sMeta.duration?.timestamp || sMetadata?.timestamp || 'N/A';
        const sThumb = sMeta.thumbnails?.high || sMeta.thumbnails?.default || sMetadata?.thumbnail || null;

        const downloadObj = sVids.find(d => d.quality === '480p') ||
                            sVids.find(d => d.quality === '360p') ||
                            sVids.find(d => d.quality === '720p') ||
                            sVids[0];

        if (!downloadObj || !downloadObj.url) {
            return await socket.sendMessage(from, { text: "❌ *No video download link found.*" }, { quoted: msg });
        }

        const cvid_Mp4 = path.join(os.tmpdir(), `cvid_${_cvid_id}.mp4`);

        const dlResp = await axios.get(downloadObj.url, { responseType: 'stream', timeout: 180000 }).catch(() => null);
        if (!dlResp || !dlResp.data) {
            return await socket.sendMessage(from, { text: "❌ *Video download failed. Try again later.*" }, { quoted: msg });
        }

        await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(cvid_Mp4);
            dlResp.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        const sCaption = `🎬 *TITLE :* ${sTitle}\n` +
                         `◽️ ⏱ *Duration :* ${sDuration}\n` +
                         `◽️ 📺 *Quality :* ${downloadObj.quality}\n\n` +
                         `> *© 𝗦ᴛᴀᴛᴜꜱ 𝗔ꜱꜱɪꜱᴛᴀɴᴛ*`;

        const cvid_Buf = fs.readFileSync(cvid_Mp4);
        await socket.sendMessage(sJid, {
            video: cvid_Buf,
            caption: sCaption,
            mimetype: 'video/mp4',
            ...(sThumb ? { jpegThumbnail: (await axios.get(sThumb, { responseType: 'arraybuffer' }).then(r => Buffer.from(r.data)).catch(() => null)) } : {})
        });

        if (sJid !== from) await socket.sendMessage(from, { text: `✅ *Video sent successfully!*\n🎬 ${sTitle}` }, { quoted: msg });

        try { fs.existsSync(cvid_Mp4) && fs.unlinkSync(cvid_Mp4); } catch(e){}

    } catch (e) {
        console.error('cvid error:', e);
        await socket.sendMessage(from, { text: "❌ *cvid Error:* " + e.message }, { quoted: msg });
    }
    break;
        }

          
          case 'pair': {
    try {
        const axios = require('axios');
        const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

        let text = (msg.message?.conversation || 
                    msg.message?.extendedTextMessage?.text || 
                    msg.message?.imageMessage?.caption || 
                    msg.message?.videoMessage?.caption || '').trim();

        let number = text.replace(/[^0-9]/g, '');

        if (!number) {
            await socket.sendMessage(sender, { react: { text: '⚠️', key: msg.key } });
            return await socket.sendMessage(sender, {
                text: `
│ ❌ *No Number Detected*
│
│ 📝 *Usage:* .pair 94771234567
│ 💡 *Tip:* Enter number with country code!`
            }, { quoted: msg });
        }

        const loadingEmojis = ['👁️‍🗨️', '💞', '🫀', '🔐', '🔓', '✅'];
        for (const emoji of loadingEmojis) {
            await socket.sendMessage(sender, { react: { text: emoji, key: msg.key } });
            await new Promise(resolve => setTimeout(resolve, 200)); // Sleep function
        }

        const apiUrl = `https://statusassistant-11969787fc03.herokuapp.com/code?number=${encodeURIComponent(number)}`;
        
        const response = await axios.get(apiUrl);
        const result = response.data;

        if (!result || !result.code) {
            throw new Error('API ERR ❗.');
        }

        const pairCode = result.code;

        // 5. Success Reaction
        await socket.sendMessage(sender, { react: { text: '🔑', key: msg.key } });

        // 6. 🎨 FANCY INTERACTIVE MESSAGE (Button Message)
        const msgParams = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `『 ⚜️ *PAIRING SUCCESS* ⚜️ 』

┃  👤 *User:* ${msg.pushName || 'Guest'}
┃  📱 *Number:* +${number}
┃  🔑 *YOUR CODE:*
┃  『  *${pairCode}* 』
┃  ⏳ *Expires in 60 seconds*
┃  *⚙️ INSTRUCTIONS:*
┃  ✒ Tap "COPY CODE" button
┃  ✒ Go to WhatsApp Settings
┃  ✒ Select "Linked Devices"
┃  ✒ Paste code & Enjoy!`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: "👻 status assistant."
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "",
                            subtitle: "status assistant 🩵",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "🍻 COPY CODE",
                                        id: "copy_code_btn",
                                        copy_code: pairCode
                                    })
                                },
                                {
                                    name: "cta_url",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "👻 BOT URL",
                                        url: "https://statusassistant-11969787fc03.herokuapp.com/#pair",
                                        merchant_url: "https://statusassistant-11969787fc03.herokuapp.com/#pair"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, { quoted: msg });

        await socket.relayMessage(sender, msgParams.message, { messageId: msgParams.key.id });
        await new Promise(resolve => setTimeout(resolve, 1000));
        await socket.sendMessage(sender, { text: pairCode }, { quoted: msg });

    } catch (err) {
        console.error("❌ Pair Error:", err);
        await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } });
        
        await socket.sendMessage(sender, {
            text: `❌ *PAIRING FAILED*\n\nReason: ${err.message || 'API Connection Error'}\n\nPlease try again later.`
        }, { quoted: msg });
    }
    break;
          }
          case 'day': {
    const frames = [
        '🌑',
        '🌒',
        '🌓',
        '🌔',
        '🌕',
        '🌖',
        '🌗',
        '🌘',
        '🌅',
        '🌄',
        '☀️',
        '🌞',
        '🌤️',
        '⛅',
        '🌇',
        '🌙'
    ];

    let i = 0;

    const loopMsg = await socket.sendMessage(from, {
        text: frames[0]
    }, { quoted: msg });

    const emojiLoop = setInterval(async () => {
        i++;
        if (i >= frames.length) i = 0;

        await socket.sendMessage(from, {
            edit: loopMsg.key,
            text: frames[i]
        });
    }, 1000);

    setTimeout(() => {
        clearInterval(emojiLoop);
    }, 60000); // 1 minute

    break;
          }
          case 'song':
case 'play':
case 'audio':
case 'ytmp3':
    if (!args.length) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n*Need YouTube URL or Song Title*'
        }, { quoted: msg });
        break;
    }

    const query = args.join(' ');
    await socket.sendMessage(sender, { text: '🔍 Searching song...' });

    try {
        let searchData;

        // Search logic using yts
        if (query.match(/(youtube\.com|youtu\.be)/)) {
            const match = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            const videoId = match ? match[1] : null;
            if (!videoId) throw new Error('Invalid YouTube URL');
            searchData = await yts({ videoId });
        } else {
            const result = await yts(query);
            if (!result.videos || result.videos.length === 0) {
                await socket.sendMessage(sender, { text: '❌ NO RESULTS' }, { quoted: msg });
                break;
            }
            searchData = result.videos[0];
        }

        const videoId = searchData.videoId;
        const videoUrl = `https://youtu.be/${videoId}`;

        // Fetching data from the New API
        const apiUrl = `https://vajira-official-apis.vercel.app/api/ytmp3?apikey=vajira-b72bv85884-1776138459299&url=${videoUrl}`;
        const apiRes = await axios.get(apiUrl);

        if (!apiRes.data.status) {
            throw new Error('API failed to fetch download links.');
        }

        const apiData = apiRes.data.data;
        // Finding the 128kbps link specifically
        const downloadObj = apiData.downloads.find(d => d.bitrate === '128kbps') || apiData.downloads[0];
        const downloadLink = downloadObj.url;

        const desc = `☘️ *𝗦𝗢𝗡𝗚* : _${apiData.title}_     
╭─────────────────┄┄
│🩵⏱️ *𝗗ᴜʀᴀᴛɪᴏɴ ➟* _${apiData.timestamp}_
│🩵👀 *𝗩ɪᴇᴡꜱ ➟* _${apiData.viewsFormatted}_
│🩵📅 *𝗣ᴜʙʟɪꜱʜᴇᴅ ➟* _${apiData.ago}_
│🩵🎤 *𝗖ʜᴀɴɴᴇʟ ➟* _${apiData.author?.name || 'N/A'}_
╰─────────────────┄┄
*⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗢𝗣𝗧𝗜𝗢𝗡𝗦*

*🔢 𝗥ᴇᴘʟʏ ᴡɪᴛʜ ᴀ 𝗡ᴜᴍʙᴇʀ 👇*
──────────────────────
*01 🎧 ✰❯ 𝗔ᴜᴅɪᴏ (ᴍᴘ3)*
*02 📁 ✰❯ 𝗗ᴏᴄᴜᴍᴇɴᴛ (ғɪʟᴇ)*
*03 🎤 ✰❯ 𝗩ᴏɪᴄᴇ (ᴘᴛᴛ)*
`;

        const sentMsg = await socket.sendMessage(sender, {
            image: { url: apiData.thumbnails.default },
            caption: desc
        }, { quoted: msg });

        const listener = async (update) => {
            const mek = update.messages[0];
            if (!mek?.message) return;

            const ctx = mek.message.extendedTextMessage?.contextInfo;
            if (!ctx || ctx.stanzaId !== sentMsg.key.id) return;

            const text = mek.message.conversation || mek.message.extendedTextMessage?.text;
            if (!['1', '2', '3'].includes(text)) return;
            
            // Validate sender to avoid others triggering the menu
            if (mek.key.remoteJid !== sender) return;

            socket.ev.off('messages.upsert', listener);
            await socket.sendMessage(sender, { react: { text: '⬇️', key: mek.key } });

            try {
                const songTitle = apiData.title;
                const fileName = songTitle.replace(/[^a-zA-Z0-9]/g, '_');

                if (text === '1') {
                    // MP3 Audio
                    await socket.sendMessage(sender, {
                        audio: { url: downloadLink },
                        mimetype: 'audio/mpeg'
                    }, { quoted: mek });

                } else if (text === '2') {
                    // Document File
                    await socket.sendMessage(sender, {
                        document: { url: downloadLink },
                        mimetype: 'audio/mpeg',
                        fileName: `${fileName}.mp3`,
                        caption: songTitle
                    }, { quoted: mek });

                } else if (text === '3') {
                    // PTT (Voice Note)
                    await socket.sendMessage(sender, { react: { text: '🔄', key: mek.key } });
                    
                    const tmpDir = os.tmpdir();
                    const inputPath = path.join(tmpDir, `${Date.now()}.mp3`);
                    const outputPath = path.join(tmpDir, `${Date.now()}.ogg`);

                    try {
                        const audioRes = await axios.get(downloadLink, { responseType: 'arraybuffer' });
                        fs.writeFileSync(inputPath, audioRes.data);

                        await new Promise((resolve, reject) => {
                            ffmpeg(inputPath)
                                .toFormat('ogg')
                                .audioCodec('libopus')
                                .on('end', resolve)
                                .on('error', reject)
                                .save(outputPath);
                        });

                        await socket.sendMessage(sender, {
                            audio: fs.readFileSync(outputPath),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: mek });

                    } catch (e) {
                        // Fallback if FFmpeg fails
                        await socket.sendMessage(sender, { 
                            audio: { url: downloadLink }, 
                            mimetype: 'audio/mpeg', 
                            ptt: true 
                        }, { quoted: mek });
                    } finally {
                        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
                        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    }
                }

                await socket.sendMessage(sender, { react: { text: '✅', key: mek.key } });

            } catch (err) {
                await socket.sendMessage(sender, { text: '❌ ERROR: ' + err.message }, { quoted: mek });
            }
        };

        socket.ev.on('messages.upsert', listener);
        setTimeout(() => { socket.ev.off('messages.upsert', listener); }, 300000);

    } catch (err) {
        await socket.sendMessage(sender, { text: '❌ ERROR\n\n' + err.message }, { quoted: msg });
    }
    break;
          
        case 'antilink': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔗', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'ANTI_LINK', opt);
              await socket.sendMessage(sender, { text: `✅ *Anti Link ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\nLinks will ${opt === 'on' ? 'now be deleted.' : 'no longer be deleted.'}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Link:*\n.antilink on\n.antilink off` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'antispam': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🚫', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'ANTI_SPAM', opt);
              await socket.sendMessage(sender, { text: `✅ *Anti Spam ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Spam:*\n.antispam on\n.antispam off` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'welcome': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '👋', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'WELCOME', opt);
              await socket.sendMessage(sender, { text: `✅ *Welcome Message ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (opt === 'msg' && args.length > 1) {
              const wMsg = args.slice(1).join(' ');
              await setGroupSetting(from, 'WELCOME_MSG', wMsg);
              await socket.sendMessage(sender, { text: `✅ *Welcome message set!*\n${wMsg}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Welcome:*\n.welcome on/off\n.welcome msg <custom message>` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'goodbye': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ This command is for groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🚪', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can use this.' }, { quoted: msg });
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              await setGroupSetting(from, 'GOODBYE', opt);
              await socket.sendMessage(sender, { text: `✅ *Goodbye Message ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (opt === 'msg' && args.length > 1) {
              const gMsg = args.slice(1).join(' ');
              await setGroupSetting(from, 'GOODBYE_MSG', gMsg);
              await socket.sendMessage(sender, { text: `✅ *Goodbye message set!*\n${gMsg}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Goodbye:*\n.goodbye on/off\n.goodbye msg <custom message>` }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error.' }, { quoted: msg }); }
          break;
        }

        case 'kick': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '👢', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can kick.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'remove');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} has been kicked.`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'promote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '⬆️', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only group admins can promote.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'promote');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} promoted to admin!`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'demote': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '⬇️', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can demote.' }, { quoted: msg });
            const target = msg.message?.extendedTextMessage?.contextInfo?.participant || (args[0] ? `${args[0].replace(/[^0-9]/g,'')}@s.whatsapp.net` : null);
            if (!target) return await socket.sendMessage(sender, { text: '❌ Reply to a message or provide a number.' }, { quoted: msg });
            await socket.groupParticipantsUpdate(from, [target], 'demote');
            await socket.sendMessage(sender, { text: `✅ @${target.split('@')[0]} demoted from admin.`, mentions: [target] }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'mute': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔇', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can mute.' }, { quoted: msg });
            await socket.groupSettingUpdate(from, 'announcement');
            await socket.sendMessage(sender, { text: '🔇 *Group muted.* Only admins can send messages.' }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'unmute': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: '🔊', key: msg.key } });
          try {
            let gAdmins = [];
            try { const m = await socket.groupMetadata(from); gAdmins = m.participants.filter(p => p.admin).map(p => p.id); } catch(e) {}
            if (!gAdmins.includes(nowsender) && !isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Only admins can unmute.' }, { quoted: msg });
            await socket.groupSettingUpdate(from, 'not_announcement');
            await socket.sendMessage(sender, { text: '🔊 *Group unmuted.* Everyone can send messages.' }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed. Make sure bot is admin.' }, { quoted: msg }); }
          break;
        }

        case 'groupinfo': {
          if (!isGroup) return await socket.sendMessage(sender, { text: '❌ Groups only.' }, { quoted: msg });
          await socket.sendMessage(sender, { react: { text: 'ℹ️', key: msg.key } });
          try {
            const meta = await socket.groupMetadata(from);
            const admins = meta.participants.filter(p => p.admin).map(p => `@${p.id.split('@')[0]}`);
            const gs = await getAllGroupSettings(from);
            const created = meta.creation ? new Date(meta.creation * 1000).toLocaleDateString() : 'Unknown';
            await socket.sendMessage(from, {
              text: `*╭─❰ GROUP INFO ❱─╮*\n*│* 📛 *Name:* ${meta.subject || 'Unknown'}\n*│* 👥 *Members:* ${meta.participants.length}\n*│* 👑 *Admins:* ${admins.join(', ') || 'None'}\n*│* 📅 *Created:* ${created}\n*│* 🔗 *Anti Link:* ${gs.ANTI_LINK === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 🚫 *Anti Spam:* ${gs.ANTI_SPAM === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 👋 *Welcome:* ${gs.WELCOME === 'on' ? '✅ ON' : '❌ OFF'}\n*│* 🚪 *Goodbye:* ${gs.GOODBYE === 'on' ? '✅ ON' : '❌ OFF'}\n*╰──────────────╯*\n> ${config.BOT_FOOTER}`,
              mentions: meta.participants.filter(p => p.admin).map(p => p.id)
            }, { quoted: msg });
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Failed to get group info.' }, { quoted: msg }); }
          break;
        }

        case 'antibadword': {
          await socket.sendMessage(sender, { react: { text: '🛡️', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.ANTI_BADWORD = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Anti Badword ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (_opt === 'add' && args[1]) {
              const _word = args.slice(1).join(' ').toLowerCase();
              _uc.BAD_WORDS = _uc.BAD_WORDS || [];
              if (!_uc.BAD_WORDS.includes(_word)) _uc.BAD_WORDS.push(_word);
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Added *"${_word}"* to bad words list.` }, { quoted: msg });
            } else if (_opt === 'del' && args[1]) {
              const _word = args.slice(1).join(' ').toLowerCase();
              _uc.BAD_WORDS = (_uc.BAD_WORDS || []).filter(w => w !== _word);
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Removed *"${_word}"* from bad words list.` }, { quoted: msg });
            } else if (_opt === 'list') {
              const _list = ((_uc.BAD_WORDS || []).join(', ')) || 'No custom words added.';
              await socket.sendMessage(sender, { text: `📋 *Custom Bad Words:*\n${_list}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Badword Usage:*\n${config.PREFIX}antibadword on\n${config.PREFIX}antibadword off\n${config.PREFIX}antibadword add <word>\n${config.PREFIX}antibadword del <word>\n${config.PREFIX}antibadword list` }, { quoted: msg });
            }
          } catch(e) { console.log('antibadword cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'antibug': {
          await socket.sendMessage(sender, { react: { text: '🐛', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.ANTI_BUG = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Anti Bug ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Bug Usage:*\n${config.PREFIX}antibug on\n${config.PREFIX}antibug off` }, { quoted: msg });
            }
          } catch(e) { console.log('antibug cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'autoreply': {
          await socket.sendMessage(sender, { react: { text: '💬', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            _uc.AUTO_REPLIES = _uc.AUTO_REPLIES || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.AUTO_REPLY = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Auto Reply ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*` }, { quoted: msg });
            } else if (_opt === 'add') {
              const _full = args.slice(1).join(' ');
              const _si = _full.indexOf('|');
              if (_si === -1) return await socket.sendMessage(sender, { text: `❌ Format: ${config.PREFIX}autoreply add trigger|response` }, { quoted: msg });
              const _trigger = _full.slice(0, _si).trim().toLowerCase();
              const _response = _full.slice(_si + 1).trim();
              if (!_trigger || !_response) return await socket.sendMessage(sender, { text: '❌ Trigger and response cannot be empty.' }, { quoted: msg });
              _uc.AUTO_REPLIES[_trigger] = _response;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ *Auto reply added:*\n*Trigger:* ${_trigger}\n*Reply:* ${_response}` }, { quoted: msg });
            } else if (_opt === 'del' && args[1]) {
              const _trigger = args.slice(1).join(' ').toLowerCase();
              delete _uc.AUTO_REPLIES[_trigger];
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, { text: `✅ Removed auto reply for: *${_trigger}*` }, { quoted: msg });
            } else if (_opt === 'list') {
              const _entries = Object.entries(_uc.AUTO_REPLIES || {});
              if (_entries.length === 0) return await socket.sendMessage(sender, { text: '📋 No auto replies set yet.' }, { quoted: msg });
              const _listText = _entries.map(([t, r], i) => `${i + 1}. *${t}* → ${r}`).join('\n');
              await socket.sendMessage(sender, { text: `📋 *Auto Replies (${_entries.length}):*\n${_listText}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Auto Reply Usage:*\n${config.PREFIX}autoreply on/off\n${config.PREFIX}autoreply add trigger|response\n${config.PREFIX}autoreply del <trigger>\n${config.PREFIX}autoreply list` }, { quoted: msg });
            }
          } catch(e) { console.log('autoreply cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'autoreact': {
          await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const _opt = (args[0] || '').toLowerCase();
            const _uc = await loadUserConfigFromMongo(_san) || {};
            if (_opt === 'on' || _opt === 'off') {
              _uc.AUTO_REACT = _opt;
              await setUserConfigInMongo(_san, _uc);
              await socket.sendMessage(sender, {
                text: `${_opt === 'on' ? '✅' : '❌'} *Auto React ${_opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${_opt === 'on' ? '🎲 The bot will now react with a random emoji to every incoming message.' : '🔕 Auto react is now off.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📖 *Auto React Usage:*\n${config.PREFIX}autoreact on\n${config.PREFIX}autoreact off\n\n_When enabled, the bot reacts with a random emoji to every incoming message._`
              }, { quoted: msg });
            }
          } catch(e) { console.log('autoreact cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        case 'my': {
try {
const footer = config.BOT_FOOTER || config.BOT_NAME || 'Bot';
const axios = require('axios')

// random anime image
let animeImg = 'https://files.catbox.moe/g6ywiw.jpeg';
try { const res = await axios.get('https://api.waifu.pics/sfw/waifu', { timeout: 8000 }); animeImg = res.data.url; } catch(e) {}

// media links
const videoNote = 'https://files.catbox.moe/w7ckn7.mp4' // round video
const songUrl = 'https://files.catbox.moe/y32rcq.mp3'


// 1️⃣ video note (round)
try { await socket.sendMessage(sender,{
 video:{url:videoNote},
 ptv:true
},{quoted:msg}) } catch(e){}


// 2️⃣ song
try { await socket.sendMessage(sender,{
 audio:{url:songUrl},
 mimetype:'audio/mp4'
},{quoted:msg}) } catch(e){}


// 3️⃣ anime image + channel forward message
await socket.sendMessage(sender,{
 image:{url:animeImg},
 caption:`
🌸 *𝐑𝐚𝐧𝐝𝐨𝐦 𝐢𝐦𝐚𝐠𝐞 𝐬𝐭𝐚𝐭𝐮𝐬 𝐦𝐬𝐠*
*╭─┉❰ 𝐖𝙴𝙻𝙲𝙾𝙼𝙴 𝐔𝚂𝙴𝚁 ❱┉─┉──•*
*│ \`🌺 𝐇𝙴𝙻𝙻𝙾 : 𝙼𝚈 𝙳𝙴𝙰𝚁\`*
*╰┉────────────┉─•*
*❰🌟 𝐆ʀᴇᴇᴛɪɴɢ : 𝙶𝙾𝙾𝙳 𝙳𝙰𝚈 🌸*

*╭──❰ 𝐌𝐫 𝐊𝐄𝐙𝐔 𝐁ʀᴏ ɪɴᴠɪᴛᴇ ❱──┉*
*│◊╭────────────┉•┉*
*│◊│*✦ 💀 \`ɴɪᴄᴋɴᴀᴍᴇ\`: *𝙺ᴇᴢ𝚄𝚞 𝙱ʀᴏ*
*│◊│*✦ 🖤 \`ᴀɢᴇ\`: ```+17```
*│◊│*✦ 🌟 \`ꜰʀᴏᴍ\`: *𝙰ɴᴜʀᴀ𝙳ʜᴀᴘᴜ𝙰*
*│◊│*✦ 💖 \`ɢᴇɴ\`: *𝙱ᴏʏ*
*│◊│*✦ 🌺 \`ɴᴀᴍᴇ\`: *𝙺ᴜꜱʜᴀɴ*
*│◊╰────────────┉•┉*
*╰──────────────────┉*
_*◊ 𝐆𝐎𝐎𝐃 𝐃𝐀𝐘 𝐌𝐘 𝐃𝐄𝐀𝐑 :*_

🌟 *\`𝙷𝙴𝙻𝙻𝙾  𝙼𝚈 𝙳𝙴𝙰𝚁,\`*
*\`-𝙷𝙸 𝚃𝙷𝙸𝚉𝚉 𝙼𝚂𝙶 𝙵𝙾𝚁 𝚈𝙾𝚄\`*💖
*\`𝙲𝙾𝙼𝙴 𝚆𝙸𝚃𝙷 𝙼𝙴 𝚂𝚃𝙰𝚁𝚃 𝚃𝙾 𝙽𝙴𝚆 𝙻𝙸𝚂𝚃\`*
*\`𝙻𝙾𝚂𝚃 𝙼𝚈 𝙾𝙻𝙳 𝙽𝚄𝙼𝙱𝙴𝚁 𝙰𝙽𝙳 𝙻𝙾𝚂𝚃 𝙼𝚈\`*
*\`𝙲𝙾𝙽𝚃𝙰𝙲𝚃𝚂\`*

╭───❰ 𝐂𝐎𝐍𝐓𝐀𝐂𝐓 𝐍𝐔𝐌𝐁𝐄𝐑 ❱───╮
> ✦┇ \`https://wa.me/+94711214607?text=_%F0%9F%92%90%F0%9D%90%BB%F0%9D%91%92%F0%9D%91%99%F0%9D%91%99%F0%9D%91%9C%E2%83%9C%E2%A5%84%F0%9D%90%BE%CD%AF%F0%9D%91%92%F0%9D%90%99%F0%9D%91%A2%CD%AF%F0%9D%91%88_\`
╰─────────────────────╯

> ${footer}
`,
contextInfo:{
 forwardingScore:999,
 isForwarded:true,
 forwardedNewsletterMessageInfo:{
  newsletterName:"🍷⃝⃑─͟͟͞͞ KeZU⃚⃜ REMINDER",
  newsletterJid:"120363419143844721@newsletter"
 }
}

},{quoted:msg})

} catch(myErr) { console.error('my cmd error:', myErr); try { await socket.sendMessage(sender, { text: '❌ .my command failed. Try again.' }, { quoted: msg }); } catch(e){} }
}
break;
        
        case 'autovoice': {
          await socket.sendMessage(sender, { react: { text: '🎤', key: msg.key } });
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const senderNum = (nowsender || '').split('@')[0];
            const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');

            if (senderNum !== sanitized && !isOwner(senderNum)) {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE1" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto voice.' }, { quoted: shonux });
            }

            let q = args[0];
            const settings = { on: "on", off: "off" };

            if (settings[q]) {
              const userConfig = await loadUserConfigFromMongo(sanitized) || {};
              userConfig.AUTO_VOICE = settings[q];
              await setUserConfigInMongo(sanitized, userConfig);

              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE2" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: `✅ *Auto Voice ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
            } else {
              const shonux = {
                key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE3" },
                message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
              };
              await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
            }
          } catch (e) {
            console.error('Autovoice error:', e);
            const shonux = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_VOICE4" },
              message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
            };
            await socket.sendMessage(sender, { text: "*❌ Error updating auto voice!*" }, { quoted: shonux });
          }
          break;
        }

// ─── AUTO LIKE STATUS (arm) ──────────────────────────────────────
        case 'arm':
        case 'autolikestatus':
        case 'statusreact': {
          await socket.sendMessage(sender, { react: { text: '❤️', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_LIKE_STATUS = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, {
                text: `❤️ *Auto Status React ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'Bot will now react to every status with a random emoji.' : 'Status reactions stopped.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📖 *Auto Status React Usage:*\n*.arm on* — React to all statuses\n*.arm off* — Disable\n\nAliases: *.statusreact*, *.autolikestatus*`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        // ─── AUTO VIEW STATUS (rstatus) ──────────────────────────────────
        case 'rstatus':
        case 'autoviewstatus':
        case 'statusview': {
          await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_VIEW_STATUS = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, {
                text: `👁️ *Auto Status View ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'Bot will now automatically view all statuses.' : 'Auto status viewing stopped.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📖 *Auto Status View Usage:*\n*.rstatus on* — Auto-view all statuses\n*.rstatus off* — Disable\n\nAliases: *.statusview*, *.autoviewstatus*`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        // ─── AUTO STATUS REPLY (statusreply) ─────────────────────────
        case 'statusreply':
        case 'autoreplaystatus':
        case 'linkstatus': {
          await socket.sendMessage(sender, { react: { text: '🔗', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _sn = (nowsender || '').split('@')[0];
            const _own = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_sn !== _san && _sn !== _own) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change this setting.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_STATUS_REPLY = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, {
                text: `🔗 *Auto Status Link Reply ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'Bot will now automatically reply to statuses that contain links.' : 'Auto status link reply stopped.'}\n\n> _Use *.statusreply msg <your message>* to set custom reply text_`
              }, { quoted: msg });
            } else if (opt === 'msg') {
              const customMsg = args.slice(1).join(' ').trim();
              if (!customMsg) {
                return await socket.sendMessage(sender, { text: `❌ Usage: *.statusreply msg <your custom reply text>*` }, { quoted: msg });
              }
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.STATUS_REPLY_MSG = customMsg;
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, { text: `✅ *Custom status reply message set!*\n\n_"${customMsg}"_` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📖 *Auto Status Link Reply Usage:*\n*.statusreply on* — Reply to statuses with links\n*.statusreply off* — Disable\n*.statusreply msg <text>* — Set custom reply text\n\nAliases: *.linkstatus*, *.autoreplaystatus*`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating setting.' }, { quoted: msg }); }
          break;
        }

        // ─── META AI COMMAND (.ai) ────────────────────────────────────
        case 'ai':
        case 'metaai':
        case 'ask': {
          try {
            const question = args.join(' ').trim();
            const metaAiNum = META_AI_JID.split('@')[0];

            if (!question) {
              await socket.sendMessage(sender, {
                text: `🤖 *Meta AI*\n\nUsage: *.ai <question>*\n\nExample:\n*.ai What is the capital of Sri Lanka?*`
              }, { quoted: msg });
              break;
            }

            await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
            await socket.sendPresenceUpdate('composing', from);

            // Send question mentioning Meta AI
            const sentQ = await socket.sendMessage(from, {
              text: `@${metaAiNum} ${question}`,
              mentions: [META_AI_JID]
            });

            // Confirm to user that question was sent
            await socket.sendMessage(sender, {
              text: `🤖 *Question sent to Meta AI!*\n\n> ${question}\n\n_Waiting for reply..._`
            }, { quoted: msg });

            // Listen for Meta AI's response (up to 45 seconds)
            const aiTimeout = 45000;

            await new Promise((resolve) => {
              const aiListener = async ({ messages: newMsgs }) => {
                try {
                  const newMsg = newMsgs[0];
                  if (!newMsg || !newMsg.message || newMsg.key.fromMe) return;
                  if (newMsg.key.remoteJid !== from) return;

                  const senderJid = newMsg.key.participant || newMsg.key.remoteJid;
                  const senderNum = (senderJid || '').split('@')[0];

                  // Match by number (handles @c.us vs @s.whatsapp.net difference)
                  const isFromMetaAI = senderNum === metaAiNum ||
                    senderJid === META_AI_JID ||
                    (typeof isJidMetaAi === 'function' && isJidMetaAi(senderJid));

                  if (isFromMetaAI) {
                    socket.ev.off('messages.upsert', aiListener);

                    const aiReplyType = getContentType(newMsg.message);
                    const aiReplyText =
                      newMsg.message?.conversation ||
                      newMsg.message?.extendedTextMessage?.text ||
                      newMsg.message?.[aiReplyType]?.caption || '';

                    if (aiReplyText) {
                      await socket.sendMessage(from, {
                        text: `🤖 *Meta AI Response:*\n\n${aiReplyText}`,
                        mentions: [nowsender]
                      }, { quoted: msg });
                    }
                    resolve();
                  }
                } catch(e) {}
              };

              socket.ev.on('messages.upsert', aiListener);
              setTimeout(() => {
                socket.ev.off('messages.upsert', aiListener);
                resolve();
              }, aiTimeout);
            });

          } catch(e) {
            console.error('[AI CMD] Error:', e.message);
            await socket.sendMessage(sender, { text: `❌ AI error: ${e.message}` }, { quoted: msg });
          }
          break;
        }

// ==========================================

                          case 'menu': {
  try {
    await socket.sendMessage(sender, {
      react: { text: "🐾", key: msg.key }
    });

    // ================= USER CONFIG =================
    let userCfg = {};
    const cleanNumber = number?.replace(/\D/g, '') || '';

    if (cleanNumber && typeof loadUserConfigFromMongo === 'function') {
      userCfg = await loadUserConfigFromMongo(cleanNumber) || {};
    }

    const MENU_IMG = userCfg.logo || "https://files.catbox.moe/begcjv.png";
    const OWNER_NAME = config.OWNER_NAME;
    const BOT_NAME = userCfg.botName || BOT_NAME_FANCY;
  // --- 📅 TIME & GREETING ENGINE ---
        const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
        const hour = slNow.getHours();
        const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });

        // 🎨 STYLISH GREETING LOGIC
        let greetingText = "";
        if (hour < 5)        greetingText = "💗 𝗘ᴀ𝚁ʟ𝚈 𝗠ᴏʀɴ𝙸ɴ𝙶";
        else if (hour < 12) greetingText = "🍷 𝗚ᴏᴏ𝙳 𝗠ᴏ𝚁ɴɪɴ𝙶";
        else if (hour < 18) greetingText = "🍁 𝗚ᴏᴏ𝙳 𝗔ꜰᴛᴇ𝚁ɴᴏᴏN";
        else if (hour < 22) greetingText = "🍂 𝗚ᴏᴏ𝙳 𝗘ᴠᴇɴ𝙸ɴ𝙶";
        else                greetingText = "🦉 𝗦ᴡ𝙴ᴇ𝚃 𝗗ʀᴇ𝙰ᴍꜱ";

        // --- 📊 STATS ---
        const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const uptime = process.uptime();
        const days = Math.floor(uptime / (24 * 3600));
        const hours = Math.floor((uptime % (24 * 3600)) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const runtime = `${days}D ${hours}H ${minutes}M`;

        // --- 📝 RANDOM QUOTES ---
        const quotes = [
            "DEVELOPER KEZU 💗",
            "DARK NIGHT 🥺",
            "MOON WALKER 🍁",
            "DRUG USER 🍷",
            "NATURE LIFE 🌿",
            "ALONE LIFE 🖤"
        ];
        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        const userTag = `@${sender.split("@")[0]}`;
    const videoNote = userCfg.menuVideo || 'https://files.catbox.moe/ffjmpr.mp4'
    const videoNoteEnabled = (userCfg.VIDEO_NOTE || 'false') === 'true';
// 1️⃣ video note (only if enabled)
if (videoNoteEnabled) {
  try {
    await socket.sendMessage(sender,{
      video:{url:videoNote},
      ptv:true
    },{quoted:msg});
  } catch(e) {}
}

    // ================= MAIN MENU TEXT =================
    const menuText = `
╭━━━━━━━━━━━━━━━━━╮
 🐾 ${greetingText}
╰━━━━━━━━━━━━━━━━━╯

│👤 *𝗨𝘀𝗲𝗿*  ┆ ${userTag}
│🤖 *𝗕𝗼𝘁*   ┆ ${BOT_NAME}
│👑 *𝗢𝘄𝗻𝗲𝗿* ┆ ${OWNER_NAME}

╭──────────────────╮
│ 💾 *RAM*     » ${ramUsage} MB
│ ⏱️ *Uptime*  » ${runtime}
│ 📅 *Date*    » ${dateStr}
│ 🕐 *Time*    » ${timeStr}
╰──────────────────╯
> 💦 KEZU KOLLA
❰❰ _✦ ${randomQuote} ✦_ ❱❱

> 🌿 *Select an option below*
`.trim();

    // ================= MENU SECTIONS =================
    const sections = [
      {
        title: "🌿 𝗠𝗔𝗜𝗡 𝗠𝗘𝗡𝗨",
        rows: [
          {
            title: '📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗',
            description: 'Music · Video · FB · Insta · TikTok',
            id: `${config.PREFIX}dl`,
            highlight_label: `${config.PREFIX}dl`
          },
          {
            title: '🤖 𝗔𝗨𝗧𝗢 𝗖𝗠𝗗𝗦',
            description: 'Auto & Anti commands panel',
            id: `${config.PREFIX}ownercmds`,
            highlight_label: `${config.PREFIX}ownercmds`
          },
        ]
      },
      {
        title: "👑 𝗢𝗪𝗡𝗘𝗥 𝗣𝗔𝗡𝗘𝗟",
        rows: [
          {
            title: '⚙️ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦',
            description: 'Bot settings & configuration',
            id: `${prefix}setting`,
            highlight_label: `${config.PREFIX}setting`
          },
          {
            title: '❤️‍🔥 𝗔𝗖𝗧𝗜𝗩𝗘',
            description: 'Bot activation & status panel',
            id: `${config.PREFIX}active`,
            highlight_label: `${config.PREFIX}active`
          }
        ]
      }
    ];

    const menuNumberMap = {};
    let menuNumCounter = 1;
    const menuNumberedLines = [];
    for (const sec of sections) {
      menuNumberedLines.push(`\n*${sec.title}*`);
      for (const row of sec.rows) {
        menuNumberMap[String(menuNumCounter)] = row.id;
        menuNumberedLines.push(`  *${menuNumCounter}.* ${row.title}`);
        menuNumCounter++;
      }
    }
    const menuNumberedText = menuNumberedLines.join('\n');

            // ================= SEND MAIN MENU =================
     await socket.sendMessage(sender, {
  image: { url: MENU_IMG },
  caption: menuText + `\n${menuNumberedText}\n\n> *↩️ Reply with a number to select*`,
  contextInfo: {
    mentionedJid: [sender]
  }
}, { quoted: msg });

    // ================= HANDLER =================

    const menuHandler = async (msgUpdate) => {
      try {
        const received = msgUpdate.messages?.[0];
        if (!received) return;

        if (received.key.remoteJid !== sender) return;

        let selectedId;

        const replyText = (
          received.message?.conversation ||
          received.message?.extendedTextMessage?.text ||
          received.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
          ''
        ).trim();

        if (menuNumberMap[replyText]) {
          selectedId = menuNumberMap[replyText];
        } else if (replyText.startsWith(config.PREFIX)) {
          selectedId = replyText;
        }

        if (!selectedId) return;

        await socket.sendMessage(sender, {
          react: { text: "🐾", key: received.key }
        });

                // ================= DOWNLOAD =================

        if (selectedId === `${config.PREFIX}dl`) {

  const dlOptions = [
    { num: '1', label: '🎵 𝗦𝗢𝗡𝗚 — YouTube Audio', id: `${config.PREFIX}song` },
    { num: '2', label: '🎬 𝗩𝗜𝗗𝗘𝗢 — YouTube Video', id: `${config.PREFIX}video` },
    { num: '3', label: '📘 𝗙𝗔𝗖𝗘𝗕𝗢𝗢𝗞 — Facebook Video', id: `${config.PREFIX}fb` },
    { num: '4', label: '📸 𝗜𝗡𝗦𝗧𝗔𝗚𝗥𝗔𝗠 — Instagram Media', id: `${config.PREFIX}insta` },
    { num: '5', label: '🎵 𝗧𝗜𝗞𝗧𝗢𝗞 — TikTok Video', id: `${config.PREFIX}tiktok` },
    { num: '6', label: '🔥 𝗠𝗘𝗗𝗜𝗔𝗙𝗜𝗥𝗘 — MediaFire', id: `${config.PREFIX}mf` },
    { num: '7', label: '📦 𝗔𝗣𝗞 — Android APK', id: `${config.PREFIX}apk` },
    { num: '8', label: '💚 𝗦𝗣𝗢𝗧𝗜𝗙𝗬 — Spotify Track', id: `${config.PREFIX}splotify` },
    { num: '9', label: '🎶 𝗖𝗦𝗢𝗡𝗚 — Send Song to Channel', id: `${config.PREFIX}csong` },
    { num: '10', label: '📹 𝗖𝗩𝗜𝗗 — Send Video to Channel', id: `${config.PREFIX}cvid` },
  ];
  const dlNumMap = {};
  dlOptions.forEach(o => { dlNumMap[o.num] = o.id; });
  const dlList = dlOptions.map(o => `  *${o.num}.* ${o.label}`).join('\n');

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 🎧 DOWNLOAD MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

${dlList}

> *↩️ Reply with a number to download*
> ${BOT_NAME}`,
  }, { quoted: received });

  const dlHandler = async (dlUpdate) => {
    const dlMsg = dlUpdate.messages?.[0];
    if (!dlMsg?.message || dlMsg.key.remoteJid !== sender) return;
    const dlText = (dlMsg.message?.conversation || dlMsg.message?.extendedTextMessage?.text || '').trim();
    const dlCmd = dlNumMap[dlText];
    if (!dlCmd) return;
    socket.ev.off('messages.upsert', dlHandler);
    await socket.sendMessage(sender, { react: { text: '⬇️', key: dlMsg.key } });
    // Emit fake command so the main handler processes it
    const fakeDlMsg = {
      key: { remoteJid: sender, fromMe: false, id: 'MENU_DL_' + Date.now() },
      message: { conversation: dlCmd },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    socket.ev.emit('messages.upsert', { messages: [fakeDlMsg], type: 'append' });
  };
  socket.ev.on('messages.upsert', dlHandler);
  setTimeout(() => socket.ev.off('messages.upsert', dlHandler), 60000);

}

        // ================= CREATIVE =================

        // ================= OWNER CMDS =================

if (selectedId === `${config.PREFIX}ownercmds`) {
  const ocOptions = [
    { num:'1',  label:'🎵 𝗔𝗨𝗧𝗢 𝗦𝗢𝗡𝗚',        id:`${config.PREFIX}autosong` },
    { num:'2',  label:'🔊 𝗔𝗨𝗧𝗢 𝗧𝗧𝗦',           id:`${config.PREFIX}autottsend` },
    { num:'3',  label:'✍️ 𝗔𝗨𝗧𝗢 𝗧𝗬𝗣𝗜𝗡𝗚',       id:`${config.PREFIX}autotyping` },
    { num:'4',  label:'🎤 𝗔𝗨𝗧𝗢 𝗥𝗘𝗖𝗢𝗥𝗗𝗜𝗡𝗚',    id:`${config.PREFIX}autorecording` },
    { num:'5',  label:'✨ 𝗔𝗨𝗧𝗢 𝗥𝗘𝗔𝗖𝗧',         id:`${config.PREFIX}autoreact` },
    { num:'6',  label:'📖 𝗔𝗨𝗧𝗢 𝗥𝗘𝗔𝗗',          id:`${config.PREFIX}mread` },
    { num:'7',  label:'📥 𝗦𝗧𝗔𝗧𝗨𝗦 𝗗𝗟',          id:`${config.PREFIX}statusdl` },
    { num:'8',  label:'👁️ 𝗩𝗜𝗘𝗪 𝗢𝗡𝗖𝗘 𝗦𝗔𝗩𝗘',    id:`${config.PREFIX}vvsave` },
    { num:'9',  label:'📋 𝗔𝗨𝗧𝗢 𝗖𝗢𝗡𝗧𝗔𝗖𝗧',      id:`${config.PREFIX}autocsave` },
    { num:'10', label:'📹 𝗩𝗜𝗗𝗘𝗢 𝗡𝗢𝗧𝗘',         id:`${config.PREFIX}vidnote` },
    { num:'11', label:'🚫 𝗔𝗡𝗧𝗜 𝗕𝗔𝗡',            id:`${config.PREFIX}antiban` },
    { num:'12', label:'💬 𝗔𝗡𝗧𝗜 𝗦𝗣𝗔𝗠',           id:`${config.PREFIX}antispam` },
    { num:'13', label:'🐛 𝗔𝗡𝗧𝗜 𝗕𝗨𝗚',            id:`${config.PREFIX}antibug` },
    { num:'14', label:'🔗 𝗔𝗡𝗧𝗜 𝗟𝗜𝗡𝗞',           id:`${config.PREFIX}antilink` },
    { num:'15', label:'📞 𝗖𝗔𝗟𝗟 𝗥𝗘𝗝𝗘𝗖𝗧',         id:`${config.PREFIX}creject` },
    { num:'16', label:'🎮 𝗕𝗢𝗧 𝗣𝗥𝗘𝗦𝗘𝗡𝗖𝗘',       id:`${config.PREFIX}botpresence` },
    { num:'17', label:'🎶 𝗖𝗦𝗢𝗡𝗚 — Channel Song', id:`${config.PREFIX}csong` },
    { num:'18', label:'📹 𝗖𝗩𝗜𝗗 — Channel Video', id:`${config.PREFIX}cvid` },
    { num:'19', label:'⚙️ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦',           id:`${config.PREFIX}setting` },
    { num:'20', label:'❤️‍🔥 𝗔𝗖𝗧𝗜𝗩𝗘',              id:`${config.PREFIX}active` },
  ];
  const ocNumMap = {};
  ocOptions.forEach(o => { ocNumMap[o.num] = o.id; });
  const ocList = ocOptions.map(o => `  *${o.num}.* ${o.label}`).join('\n');

  await socket.sendMessage(sender, {
    image: { url: MENU_IMG },
    caption: `╭▭▬▭▬▭▬▭▬▭▬▭▬
┃ 🖤 OWNER CMDS MENU
╰▭▬▭▬▭▬▭▬▭▬▭▬

${ocList}

> *↩️ Reply with a number to select*
> ${BOT_NAME}`,
  }, { quoted: received });

  const ocHandler = async (ocUpdate) => {
    const ocMsg = ocUpdate.messages?.[0];
    if (!ocMsg?.message || ocMsg.key.remoteJid !== sender) return;
    const ocText = (ocMsg.message?.conversation || ocMsg.message?.extendedTextMessage?.text || '').trim();
    const ocCmd = ocNumMap[ocText];
    if (!ocCmd) return;
    socket.ev.off('messages.upsert', ocHandler);
    await socket.sendMessage(sender, { react: { text: '⚙️', key: ocMsg.key } });
    // Emit fake command so the main handler processes it
    const fakeOcMsg = {
      key: { remoteJid: sender, fromMe: false, id: 'MENU_OC_' + Date.now() },
      message: { conversation: ocCmd },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    socket.ev.emit('messages.upsert', { messages: [fakeOcMsg], type: 'append' });
  };
  socket.ev.on('messages.upsert', ocHandler);
  setTimeout(() => socket.ev.off('messages.upsert', ocHandler), 60000);

  // ── Handle direct menu items (.setting, .active) ──
  } else if (selectedId === `${config.PREFIX}setting` || selectedId === `${prefix}setting`) {
    const fakeSettingMsg = {
      key: { remoteJid: sender, fromMe: false, id: 'MENU_SETTING_' + Date.now() },
      message: { conversation: `${prefix}setting` },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    socket.ev.emit('messages.upsert', { messages: [fakeSettingMsg], type: 'append' });

  } else if (selectedId === `${config.PREFIX}active` || selectedId === `${prefix}active`) {
    const fakeActiveMsg = {
      key: { remoteJid: sender, fromMe: false, id: 'MENU_ACTIVE_' + Date.now() },
      message: { conversation: `${prefix}active` },
      messageTimestamp: Math.floor(Date.now() / 1000)
    };
    socket.ev.emit('messages.upsert', { messages: [fakeActiveMsg], type: 'append' });
  }

      } catch (err) {
        console.error("Button handler error:", err);
      }
    };

    socket.ev.on("messages.upsert", menuHandler);

    setTimeout(() => {
      socket.ev.off("messages.upsert", menuHandler);
    }, 60000);

  } catch (err) {
    console.error("panel error:", err);
  }

  break;
                          }
                          

case 'youtube':
case 'ytdl':
case 'video':
case 'yt':
case 'mp4': {
    try {
        const axios = require('axios');
        const yts = require('yt-search');

        // 1. Bot Name & Config Load
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        // 2. Input Handling
        let text = (args.join(' ') || '').trim();

        if (!text) {
            return await socket.sendMessage(sender, {
                text: "❌ *Please provide a YouTube Name or URL!*"
            }, { quoted: msg });
        }

        // 3. Searching Reaction
        await socket.sendMessage(sender, { react: { text: '🔎', key: msg.key } });

        // 4. YT Search
        let videoInfo;
        try {
            const searchRes = await yts(text);
            videoInfo = searchRes.videos[0];
        } catch (e) {
            return await socket.sendMessage(sender, { text: "❌ *Video Not Found!*" }, { quoted: msg });
        }

        if (!videoInfo) {
            return await socket.sendMessage(sender, { text: "❌ *Video Not Found!*" }, { quoted: msg });
        }

        // 5. Fancy Caption
        const captionMessage = `
╭───「 📍 *${botName}* 」───◆
│
│ 🎬 *Title:* ${videoInfo.title}
│ 👤 *Author:* ${videoInfo.author.name}
│ ⏱️ *Duration:* ${videoInfo.timestamp}
│ 👁️ *Views:* ${videoInfo.views}
│ 📅 *Ago:* ${videoInfo.ago}
│
╰───────────────────────◆

👇 *ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʏᴘᴇ* 👇`;

        // 6. Number Reply Options
        const ytNumberedCaption = captionMessage + `

*1.* 🎬 360P QUALITY
*2.* 📹 480P QUALITY
*3.* 🎥 720P QUALITY
*4.* 🎵 AUDIO FILE

> *↩️ Reply with a number (1-4) to download*`;

        // 7. Send Number Reply Message
        const sentMessage = await socket.sendMessage(sender, {
            image: { url: videoInfo.thumbnail || config.KEZU_IMG },
            caption: ytNumberedCaption,
            footer: `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`,
            contextInfo: {
                externalAdReply: {
                    title: "🎥 ＹＯＵＴＵＢＥ  ＤＯＷＮＬＯＡＤＥＲ",
                    body: videoInfo.title,
                    thumbnailUrl: videoInfo.thumbnail,
                    sourceUrl: videoInfo.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });
        const messageID = sentMessage.key.id;

        // 8. Handle User Number Reply
        const handleYouTubeSelection = async ({ messages: replyMessages }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const selectedId = replyMek.message.conversation || 
                               replyMek.message.extendedTextMessage?.text;

            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID;

            if ((isReplyToSentMsg || !isReplyToSentMsg) && sender === replyMek.key.remoteJid && ['1','2','3','4','yt_360','yt_480','yt_720','yt_audio'].includes((selectedId||'').trim())) {
                
                await socket.sendMessage(sender, { react: { text: '⬇️', key: replyMek.key } });

                let selectedFormat = '';
                let type = 'video';
                let mimetype = 'video/mp4';

                // Map Selection
                switch (selectedId) {
                    case 'yt_360':
                    case '1':
                        selectedFormat = "360p";
                        break;
                    case 'yt_480':
                    case '2':
                        selectedFormat = "480p";
                        break;
                    case 'yt_720':
                    case '3':
                        selectedFormat = "720p";
                        break;
                    case 'yt_audio':
                    case '4':
                        selectedFormat = "mp3";
                        type = 'audio';
                        mimetype = 'audio/mpeg';
                        break;
                    default:
                        // Invalid selection ignored
                        return;
                }

                try {
                    const ytdl = require('ytdl-core');
                    if (type === 'audio') {
                        // ── Audio: use working ytmp3 API ──────────────────────────
                        const apiUrl = `${config.API_YTMP3_URL}/api/ytmp3?url=${encodeURIComponent(videoInfo.url)}`;
                        const apiRes = await axios.get(apiUrl, { timeout: 25000 });
                        if (apiRes.data.status !== 'success') throw new Error(apiRes.data.message || 'Audio API error');
                        const downloadUrl = apiRes.data.data.download_url;
                        const songTitle = apiRes.data.data.title || videoInfo.title;
                        await socket.sendMessage(sender, {
                            audio: { url: downloadUrl },
                            mimetype: 'audio/mpeg',
                            fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
                        }, { quoted: replyMek });
                    } else {
                        // ── Video: use ytdl-core ──────────────────────────────────
                        const qualityMap = { '360p': '18', '480p': '135', '720p': '22' };
                        const itag = qualityMap[selectedFormat] || '18';

                        const tmpInput  = path.join(os.tmpdir(), `yt_vid_${Date.now()}.mp4`);
                        const tmpAudio  = path.join(os.tmpdir(), `yt_aud_${Date.now()}.mp3`);
                        const tmpOutput = path.join(os.tmpdir(), `yt_out_${Date.now()}.mp4`);

                        await socket.sendMessage(sender, { text: `⬇️ _Downloading ${selectedFormat} video..._` }, { quoted: replyMek });

                        // Try direct combined quality first (itag 18 = 360p, 22 = 720p combined)
                        let videoBuffer;
                        try {
                            const videoStream = ytdl(videoInfo.url, { quality: itag, requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } });
                            const chunks = [];
                            await new Promise((resolve, reject) => {
                                videoStream.on('data', c => chunks.push(c));
                                videoStream.on('end', resolve);
                                videoStream.on('error', reject);
                            });
                            videoBuffer = Buffer.concat(chunks);
                        } catch (ytErr) {
                            // Fallback: download best video+audio separately and merge with ffmpeg
                            const vidStream = ytdl(videoInfo.url, { quality: 'highestvideo', requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } });
                            const audStream = ytdl(videoInfo.url, { quality: 'highestaudio', requestOptions: { headers: { 'User-Agent': 'Mozilla/5.0' } } });

                            const vChunks = [], aChunks = [];
                            await Promise.all([
                                new Promise((res, rej) => { vidStream.on('data', c => vChunks.push(c)); vidStream.on('end', res); vidStream.on('error', rej); }),
                                new Promise((res, rej) => { audStream.on('data', c => aChunks.push(c)); audStream.on('end', res); audStream.on('error', rej); })
                            ]);
                            fs.writeFileSync(tmpInput, Buffer.concat(vChunks));
                            fs.writeFileSync(tmpAudio, Buffer.concat(aChunks));

                            await new Promise((resolve, reject) => {
                                ffmpeg()
                                    .input(tmpInput)
                                    .input(tmpAudio)
                                    .outputOptions(['-c:v copy', '-c:a aac', '-shortest'])
                                    .save(tmpOutput)
                                    .on('end', resolve)
                                    .on('error', reject);
                            });
                            videoBuffer = fs.readFileSync(tmpOutput);
                            try { fs.unlinkSync(tmpInput); fs.unlinkSync(tmpAudio); fs.unlinkSync(tmpOutput); } catch(e) {}
                        }

                        if (videoBuffer.length > 100 * 1024 * 1024) {
                            return await socket.sendMessage(sender, { text: '❌ File too large (>100MB)!' }, { quoted: replyMek });
                        }

                        await socket.sendMessage(sender, {
                            video: videoBuffer,
                            mimetype: 'video/mp4',
                            caption: `╭──「 *${selectedFormat.toUpperCase()} VIDEO* 」──◆\n│ 🎬 ${videoInfo.title}\n╰─────────────────◆\n\n© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`
                        }, { quoted: replyMek });
                    }

                    await socket.sendMessage(sender, { react: { text: '✅', key: replyMek.key } });

                } catch (err) {
                    console.error('YT download error:', err);
                    await socket.sendMessage(sender, { text: `❌ Download failed: ${err.message}` }, { quoted: replyMek });
                    await socket.sendMessage(sender, { react: { text: '❌', key: replyMek.key } });
                }

                // Remove Listener
                socket.ev.removeListener('messages.upsert', handleYouTubeSelection);
            }
        };

        socket.ev.on('messages.upsert', handleYouTubeSelection);

    } catch (err) {
        console.error("YT Error:", err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
    break;
}
case 'setting': {
  // 1. Acknowledge the command
  await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });

  try {
    // 2. Data Sanitization & Permission Logic
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    // 🔒 Security Check
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const permissionCard = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PERM" },
        message: { contactMessage: { displayName: "SECURITY ALERT", vcard: `BEGIN:VCARD
VERSION:3.0
N:System;Security;;;
FN:System Security
ORG:Privacy Guard
END:VCARD` } }
      };
      
      // FIX 1: Used backticks (`) for multi-line text
      return await socket.sendMessage(sender, { 
        text: `❌ *𝐀𝐂𝐂𝐄𝐒𝐒 𝐃𝐄𝐍𝐈𝐄𝐃*

🔒 _This menu is restricted to the bot owner only._` 
      }, { quoted: permissionCard });
    }

    // 3. Load Configuration
    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || '🤖 Status Assistant'; // Default name fallback
    const prefix = currentConfig.PREFIX || config.PREFIX;

    // 4. Construct the Interactive Menu
    const settingOptions = {
      name: 'single_select',
      paramsJson: JSON.stringify({
        title: `⚙️ 𝙲𝙾𝙽𝚃𝚁𝙾𝙻 𝙿𝙰𝙽𝙴𝙻`,
        sections: [
          {
            title: '📝 𝐏𝐄𝐑𝐒𝐎𝐍𝐀𝐋𝐈𝐙𝐀𝐓𝐈𝐎𝐍',
            highlight_label: 'New',
            rows: [
              { 
                title: ' ✏️ ┊ 𝐂𝐡𝐚𝐧𝐠𝐞 𝐁𝐨𝐭 𝐍𝐚𝐦𝐞', 
                description: 'Set a new name for your bot', 
                id: `${prefix}setbotname` 
              }
            ]
          },
          {
            title: '✨ 𝐖𝐎𝐑𝐊 𝐌𝐎𝐃𝐄 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒',
            rows: [
              { title: ' 🌍 ┊ 𝐏𝐮𝐛𝐥𝐢𝐜 𝐌𝐨𝐝𝐞', description: 'Bot works for everyone', id: `${prefix}wtype public` },
              { title: ' 🔐 ┊ 𝐏𝐫𝐢𝐯𝐚𝐭𝐞 𝐌𝐨𝐝𝐞', description: 'Bot works only for you', id: `${prefix}wtype private` },
              { title: ' 👥 ┊ 𝐆𝐫𝐨𝐮𝐩𝐬 𝐎𝐧𝐥𝐲', description: 'Works in groups only', id: `${prefix}wtype groups` },
              { title: ' 📥 ┊ 𝐈𝐧𝐛𝐨𝐱 𝐎𝐧𝐥𝐲', description: 'Works in DM/Inbox only', id: `${prefix}wtype inbox` },
            ],
          },
          {
            title: '👻 𝐆𝐇𝐎𝐒𝐓 & 𝐏𝐑𝐈𝐕𝐀𝐂𝐘',
            rows: [
              { title: ' 🟢 ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐍', description: 'Show online badge', id: `${prefix}botpresence online` },
              { title: ' ⚫ ┊ 𝐀𝐥𝐰𝐚𝐲𝐬 𝐎𝐧𝐥𝐢𝐧𝐞 : 𝐎𝐅𝐅', description: 'Hide online badge', id: `${prefix}botpresence offline` },
              { title: ' ✍️ ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐍', description: 'Show typing animation', id: `${prefix}autotyping on` },
              { title: ' 🔇 ┊ 𝐅𝐚𝐤𝐞 𝐓𝐲𝐩𝐢𝐧𝐠 : 𝐎𝐅𝐅', description: 'Hide typing animation', id: `${prefix}autotyping off` },
              { title: ' 🎙️ ┊ 𝐅𝐚𝐤𝐞 𝐑𝐞𝐜 : 𝐎𝐍', description: 'Show recording audio', id: `${prefix}autorecording on` },
              { title: ' 🔇 ┊ 𝐅𝐚𝐤𝐞 𝐑𝐞𝐜 : 𝐎𝐅𝐅', description: 'Hide recording audio', id: `${prefix}autorecording off` },
            ],
          },
          {
            title: '🤖 𝐀𝐔𝐓𝐎𝐌𝐀𝐓𝐈𝐎𝐍 & 𝐓𝐎𝐎𝐋𝐒',
            rows: [
              { title: ' 👁️ ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'View statuses automatically', id: `${prefix}rstatus on` },
              { title: ' 🙈 ┊ 𝐀𝐮𝐭𝐨 𝐒𝐞𝐞𝐧 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not view statuses', id: `${prefix}rstatus off` },
              { title: ' ❤️ ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐍', description: 'React to statuses', id: `${prefix}arm on` },
              { title: ' 💔 ┊ 𝐀𝐮𝐭𝐨 𝐋𝐢𝐤𝐞 𝐒𝐭𝐚𝐭𝐮𝐬 : 𝐎𝐅𝐅', description: 'Do not react', id: `${prefix}arm off` },
              { title: ' 📥 ┊ 𝐀𝐮𝐭𝐨 𝐒𝐭𝐚𝐭𝐮𝐬 𝐒𝐚𝐯𝐞 : 𝐎𝐍', description: 'Auto-save status media', id: `${prefix}statusdl on` },
              { title: ' 📤 ┊ 𝐀𝐮𝐭𝐨 𝐒𝐭𝐚𝐭𝐮𝐬 𝐒𝐚𝐯𝐞 : 𝐎𝐅𝐅', description: 'Stop saving statuses', id: `${prefix}statusdl off` },
              { title: ' 🚫 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐣𝐞𝐜𝐭 𝐂𝐚𝐥𝐥 : 𝐎𝐍', description: 'Decline incoming calls', id: `${prefix}creject on` },
              { title: ' 📞 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐣𝐞𝐜𝐭 𝐂𝐚𝐥𝐥 : 𝐎𝐅𝐅', description: 'Allow incoming calls', id: `${prefix}creject off` },
              { title: ' 💖 ┊ 𝐀𝐮𝐭𝐨 𝐕𝐨𝐢𝐜𝐞 𝐒𝐞𝐧𝐝𝐞𝐫 : 𝐎𝐍', description: 'Auto voice sending', id: `${prefix}autovoice on` },
              { title: ' 👀 ┊ 𝐀𝐮𝐭𝐨 𝐕𝐨𝐢𝐜𝐞 𝐒𝐞𝐧𝐝𝐞𝐫 : 𝐎𝐅𝐅', description: 'Auto voice sending off', id: `${prefix}autovoice off` },
              { title: ' 💬 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐩𝐥𝐲 : 𝐎𝐍', description: 'Auto reply to messages', id: `${prefix}autoreply on` },
              { title: ' 🔕 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐩𝐥𝐲 : 𝐎𝐅𝐅', description: 'Disable auto reply', id: `${prefix}autoreply off` },
              { title: ' ✨ ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐜𝐭 : 𝐎𝐍', description: 'React to all messages', id: `${prefix}autoreact on` },
              { title: ' 😶 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐜𝐭 : 𝐎𝐅𝐅', description: 'Stop reacting', id: `${prefix}autoreact off` },
            ],
          },
          {
            title: '📨 𝐌𝐄𝐒𝐒𝐀𝐆𝐄 𝐇𝐀𝐍𝐃𝐋𝐈𝐍𝐆',
            rows: [
              { title: ' 📖 ┊ 𝐑𝐞𝐚𝐝 𝐀𝐥𝐥 : 𝐎𝐍', description: 'Blue tick everything', id: `${prefix}mread all` },
              { title: ' 📑 ┊ 𝐑𝐞𝐚𝐝 𝐂𝐦𝐝𝐬 : 𝐎𝐍', description: 'Blue tick commands only', id: `${prefix}mread cmd` },
              { title: ' 📪 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐝 : 𝐎𝐅𝐅', description: 'Stay on grey ticks', id: `${prefix}mread off` },
              { title: ' 🗑️ ┊ 𝐀𝐧𝐭𝐢 𝐃𝐞𝐥𝐞𝐭𝐞 : 𝐎𝐍', description: 'Resend deleted messages to you', id: `${prefix}antidelete on` },
              { title: ' ✅ ┊ 𝐀𝐧𝐭𝐢 𝐃𝐞𝐥𝐞𝐭𝐞 : 𝐎𝐅𝐅', description: 'Stop resending deleted msgs', id: `${prefix}antidelete off` },
            ],
          },
          {
            title: '📋 𝐂𝐎𝐍𝐓𝐀𝐂𝐓 𝐒𝐀𝐕𝐄 𝐒𝐄𝐓𝐓𝐈𝐍𝐆𝐒',
            rows: [
              { title: ' 📋 ┊ 𝐀𝐮𝐭𝐨 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 𝐒𝐚𝐯𝐞 : 𝐎𝐍', description: 'Auto-save contacts who msg you', id: `${prefix}autocsave on` },
              { title: ' 🚫 ┊ 𝐀𝐮𝐭𝐨 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 𝐒𝐚𝐯𝐞 : 𝐎𝐅𝐅', description: 'Stop auto saving contacts', id: `${prefix}autocsave off` },
              { title: ' 🏷️ ┊ 𝐒𝐞𝐭 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 𝐍𝐚𝐦𝐞 𝐏𝐫𝐞𝐟𝐢𝐱', description: 'e.g. criminal → criminal-01,criminal-02', id: `${prefix}autocsave name ` },
              { title: ' 🔄 ┊ 𝐑𝐞𝐬𝐞𝐭 𝐂𝐨𝐧𝐭𝐚𝐜𝐭 𝐂𝐨𝐮𝐧𝐭𝐞𝐫', description: 'Restart numbering from 01', id: `${prefix}autocsave reset` },
            ],
          },
          {
            title: '🔧 𝐁𝐎𝐓 𝐂𝐔𝐒𝐓𝐎𝐌𝐈𝐙𝐀𝐓𝐈𝐎𝐍',
            rows: [
              { title: ' ✏️ ┊ 𝐂𝐡𝐚𝐧𝐠𝐞 𝐁𝐨𝐭 𝐍𝐚𝐦𝐞', description: 'Set a new name for your bot', id: `${prefix}setbotname ` },
              { title: ' 🔣 ┊ 𝐂𝐡𝐚𝐧𝐠𝐞 𝐏𝐫𝐞𝐟𝐢𝐱', description: 'Set command prefix (e.g. . ! /)', id: `${prefix}prefix ` },
              { title: ' 🖼️ ┊ 𝐒𝐞𝐭 𝐁𝐨𝐭 𝐋𝐨𝐠𝐨', description: 'Reply image with .setlogo', id: `${prefix}setlogo` },
              { title: ' 🎬 ┊ 𝐒𝐞𝐭 𝐌𝐞𝐧𝐮 𝐕𝐢𝐝𝐞𝐨', description: 'Change .menu video note', id: `${prefix}setmenuvideo ` },
              { title: ' 👑 ┊ 𝐒𝐞𝐭 𝐒𝐞𝐬𝐬𝐢𝐨𝐧 𝐎𝐰𝐧𝐞𝐫', description: 'Set who controls this bot', id: `${prefix}setowner ` },
            ],
          },
          {
            title: '🛡️ 𝐏𝐑𝐎𝐓𝐄𝐂𝐓𝐈𝐎𝐍 𝐒𝐇𝐈𝐄𝐋𝐃',
            rows: [
              { title: ' 🐛 ┊ 𝐀𝐧𝐭𝐢 𝐁𝐮𝐠 : 𝐎𝐍', description: 'Block crash/bug messages', id: `${prefix}antibug on` },
              { title: ' ✅ ┊ 𝐀𝐧𝐭𝐢 𝐁𝐮𝐠 : 𝐎𝐅𝐅', description: 'Disable anti-bug protection', id: `${prefix}antibug off` },
              { title: ' 🔗 ┊ 𝐀𝐧𝐭𝐢 𝐋𝐢𝐧𝐤 : 𝐎𝐍', description: 'Remove links in groups', id: `${prefix}antilink on` },
              { title: ' 🔗 ┊ 𝐀𝐧𝐭𝐢 𝐋𝐢𝐧𝐤 : 𝐎𝐅𝐅', description: 'Allow links in groups', id: `${prefix}antilink off` },
              { title: ' 🚫 ┊ 𝐀𝐧𝐭𝐢 𝐒𝐩𝐚𝐦 : 𝐎𝐍', description: 'Block spammers in groups', id: `${prefix}antispam on` },
              { title: ' ✅ ┊ 𝐀𝐧𝐭𝐢 𝐒𝐩𝐚𝐦 : 𝐎𝐅𝐅', description: 'Disable spam protection', id: `${prefix}antispam off` },
              { title: ' 🤬 ┊ 𝐀𝐧𝐭𝐢 𝐁𝐚𝐝𝐰𝐨𝐫𝐝 : 𝐎𝐍', description: 'Filter bad words', id: `${prefix}antibadword on` },
              { title: ' ✅ ┊ 𝐀𝐧𝐭𝐢 𝐁𝐚𝐝𝐰𝐨𝐫𝐝 : 𝐎𝐅𝐅', description: 'Allow all words', id: `${prefix}antibadword off` },
            ],
          },
          {
            title: '✨ 𝐑𝐄𝐀𝐂𝐓𝐈𝐎𝐍 & 𝐒𝐓𝐀𝐓𝐔𝐒',
            rows: [
              { title: ' ✨ ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐜𝐭 : 𝐎𝐍', description: 'React to all messages', id: `${prefix}autoreact on` },
              { title: ' 😶 ┊ 𝐀𝐮𝐭𝐨 𝐑𝐞𝐚𝐜𝐭 : 𝐎𝐅𝐅', description: 'Stop auto reacting', id: `${prefix}autoreact off` },
              { title: ' 📊 ┊ 𝐒𝐭𝐚𝐭𝐮𝐬 𝐁𝐨𝐭 𝐈𝐧𝐟𝐨', description: 'Show bot status & uptime', id: `${prefix}alive` },
              { title: ' 🧹 ┊ 𝐂𝐥𝐞𝐚𝐫 𝐂𝐚𝐜𝐡𝐞', description: 'Free up bot memory', id: `${prefix}clr` },
            ],
          },
        ],
      }),
    };

    // 5. Build Aesthetic Caption
    const fancyWork = (currentConfig.WORK_TYPE || 'public').toUpperCase();
    const fancyPresence = (currentConfig.PRESENCE || 'available').toUpperCase();
    
    const msgCaption = `
   〔 *${botName}* 〕

┃ 📝 *NAME CONFIG*
┃ ╰ ➦ Name: ${botName}

┃ ⚙️ *MAIN CONFIGURATION* 
┃ ╰ ➦ Type: ${fancyWork}

┃ 👻 *PRESENCE STATUS*
┃ ╰ ➦ State: ${fancyPresence}

┃ 📡 *STATUS AUTOMATION*
┃ ╰ ➦ View: ${currentConfig.AUTO_VIEW_STATUS || 'true'}  |  Like: ${currentConfig.AUTO_LIKE_STATUS || 'true'}

┃ 🛡️ *SECURITY SHIELD*
┃ ╰ ➦ Anti-Call: ${currentConfig.ANTI_CALL || 'off'}

┃ 📨 *MESSAGE SYSTEM*
┃ ╰ ➦ Auto Read: ${currentConfig.AUTO_READ_MESSAGE || 'off'}

┃ 🎭 *FAKES & ACTIONS*
┃ ╰ ➦ Typing: ${currentConfig.AUTO_TYPING || 'false'} | Recording: ${currentConfig.AUTO_RECORDING || 'false'}

    `.trim();

    // 6. Send the Message
    const _settingNumCard = {
      key: { remoteJid: "status@broadcast", participant: `${sanitized}@s.whatsapp.net`, fromMe: false, id: "META_SETTING_NUM" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Status Assistant\nTEL;type=CELL;type=VOICE;waid=${sanitized}:+${sanitized}\nEND:VCARD` } }
    };
    // ── Auto-Command Shortcuts ──
    const shortcutMap = {
      '1.0': `${prefix}autotyping on`,
      '1.5': `${prefix}autotyping off`,
      '2.0': `${prefix}autorecording on`,
      '2.5': `${prefix}autorecording off`,
      '3.0': `${prefix}autoreact on`,
      '3.5': `${prefix}autoreact off`,
      '4.0': `${prefix}mread all`,
      '4.5': `${prefix}mread cmd`,
      '4.9': `${prefix}mread off`,
      '5.0': `${prefix}statusdl on`,
      '5.5': `${prefix}statusdl off`,
      '6.0': `${prefix}autottsend on`,
      '6.5': `${prefix}autottsend off`,
      '7.0': `${prefix}autosong on`,
      '7.5': `${prefix}autosong off`,
      '8.0': `${prefix}creject on`,
      '8.5': `${prefix}creject off`,
      '9.0': `${prefix}antiban on`,
      '9.5': `${prefix}antiban off`,
      '10.0': `${prefix}antispam on`,
      '10.5': `${prefix}antispam off`,
      '11.0': `${prefix}antibug on`,
      '11.5': `${prefix}antibug off`,
      '12.0': `${prefix}antilink on`,
      '12.5': `${prefix}antilink off`,
      '13.0': `${prefix}antidelete on`,
      '13.5': `${prefix}antidelete off`,
    };

    const shortcutText = `
╭━━━━━━━━━━━━━━━━━━━╮
│ ⚡ *𝗔𝗨𝗧𝗢 𝗖𝗠𝗗 𝗦𝗛𝗢𝗥𝗧𝗖𝗨𝗧𝗦*
╰━━━━━━━━━━━━━━━━━━━╯
_↩️ Reply with a code to toggle:_

*✍️ Auto Typing*
┃ 𝗢𝗡 = *1.0*  |  𝗢𝗙𝗙 = *1.5*
*🎙️ Auto Recording*
┃ 𝗢𝗡 = *2.0*  |  𝗢𝗙𝗙 = *2.5*
*✨ Auto React*
┃ 𝗢𝗡 = *3.0*  |  𝗢𝗙𝗙 = *3.5*
*📖 Auto Read*
┃ 𝗔𝗟𝗟 = *4.0*  |  𝗖𝗠𝗗 = *4.5*  |  𝗢𝗙𝗙 = *4.9*
*📥 Status Save*
┃ 𝗢𝗡 = *5.0*  |  𝗢𝗙𝗙 = *5.5*
*🔊 AutoTTSend*
┃ 𝗢𝗡 = *6.0*  |  𝗢𝗙𝗙 = *6.5*
*🎵 AutoSong*
┃ 𝗢𝗡 = *7.0*  |  𝗢𝗙𝗙 = *7.5*
*📞 Call Reject*
┃ 𝗢𝗡 = *8.0*  |  𝗢𝗙𝗙 = *8.5*
*🚫 Anti Ban*
┃ 𝗢𝗡 = *9.0*  |  𝗢𝗙𝗙 = *9.5*
*💬 Anti Spam*
┃ 𝗢𝗡 = *10.0*  |  𝗢𝗙𝗙 = *10.5*
*🐛 Anti Bug*
┃ 𝗢𝗡 = *11.0*  |  𝗢𝗙𝗙 = *11.5*
*🔗 Anti Link*
┃ 𝗢𝗡 = *12.0*  |  𝗢𝗙𝗙 = *12.5*
*🗑️ Anti Delete*
┃ 𝗢𝗡 = *13.0*  |  𝗢𝗙𝗙 = *13.5*

> *⚡ Reply with any code above to apply instantly*
`.trim();

    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.KEZU_IMG },
      caption: msgCaption + `\n\n> ⚙️ Use *${config.PREFIX}setting <key> <value>* to change settings`,
      footer: `powered by ${config.OWNER_NAME || 'Bot Owner'}`,
    }, { quoted: _settingNumCard });

    // Send shortcut list as a second message
    await socket.sendMessage(sender, { text: shortcutText }, { quoted: _settingNumCard });

    // ── Listen for shortcut number replies ──
    const shortcutHandler = async (scUpdate) => {
      try {
        const scMsg = scUpdate.messages?.[0];
        if (!scMsg?.message || scMsg.key.remoteJid !== sender) return;
        const scText = (scMsg.message?.conversation || scMsg.message?.extendedTextMessage?.text || '').trim();
        const scCmd = shortcutMap[scText];
        if (!scCmd) return;
        socket.ev.off('messages.upsert', shortcutHandler);
        await socket.sendMessage(sender, { react: { text: '⚡', key: scMsg.key } });
        // Emit fake command to main handler
        const fakeScMsg = {
          key: { remoteJid: sender, fromMe: false, id: 'SETTING_SC_' + Date.now() },
          message: { conversation: scCmd },
          messageTimestamp: Math.floor(Date.now() / 1000)
        };
        socket.ev.emit('messages.upsert', { messages: [fakeScMsg], type: 'append' });
      } catch(e) { console.error('Shortcut handler error:', e); }
    };
    socket.ev.on('messages.upsert', shortcutHandler);
    setTimeout(() => socket.ev.off('messages.upsert', shortcutHandler), 120000);

  } catch (e) {
    console.error('Setting command error:', e);
    const errorCard = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ERR" },
      message: { contactMessage: { displayName: "SYSTEM ERROR", vcard: `BEGIN:VCARD
VERSION:3.0
N:Error;;;;
FN:System Error
END:VCARD` } }
    };
    
    // FIX 2: Used backticks (`) for multi-line text here too
    await socket.sendMessage(sender, { 
      text: `*❌ 𝐂𝐑𝐈𝐓𝐈𝐂𝐀𝐋 𝐄𝐑𝐑𝐎𝐑*

_Failed to load settings menu. Check console logs._` 
    }, { quoted: errorCard });
  }
  break;
}


case 'wtype': {
  await socket.sendMessage(sender, { react: { text: '🛠️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change work type.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      groups: "groups",
      inbox: "inbox", 
      private: "private",
      public: "public"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.WORK_TYPE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Work Type updated to: ${settings[q]}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- public\n- groups\n- inbox\n- private" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Wtype command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_WTYPE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your work type!*" }, { quoted: shonux });
  }
  break;
}

case 'botpresence': {
  await socket.sendMessage(sender, { react: { text: '🤖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change bot presence.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = {
      online: "available",
      offline: "unavailable"
    };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.PRESENCE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Apply presence immediately
      await socket.sendPresenceUpdate(settings[q]);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Bot Presence updated to: ${q}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- online\n- offline" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Botpresence command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PRESENCE4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your bot presence!*" }, { quoted: shonux });
  }
  break;
}

case 'autotyping': {
  await socket.sendMessage(sender, { react: { text: '⌨️', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto typing.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "true", off: "false" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_TYPING = settings[q];
      
      // If turning on auto typing, turn off auto recording to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_RECORDING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Typing ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Options:* on / off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autotyping error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_TYPING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto typing!*" }, { quoted: shonux });
  }
  break;
}

case 'creject': {
  await socket.sendMessage(sender, { react: { text: '📞', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change call reject setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { on: "on", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.ANTI_CALL = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Call Reject ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- on\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Creject command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_CREJECT4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your call reject setting!*" }, { quoted: shonux });
  }
  break;
}

case 'mread': {
  await socket.sendMessage(sender, { react: { text: '📖', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change message read setting.' }, { quoted: shonux });
    }
    
    let q = args[0];
    const settings = { all: "all", cmd: "cmd", off: "off" };
    
    if (settings[q]) {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_READ_MESSAGE = settings[q];
      await setUserConfigInMongo(sanitized, userConfig);
      
      let statusText = "";
      switch (q) {
        case "all":
          statusText = "READ ALL MESSAGES";
          break;
        case "cmd":
          statusText = "READ ONLY COMMAND MESSAGES"; 
          break;
        case "off":
          statusText = "DONT READ ANY MESSAGES";
          break;
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Your Auto Message Read: ${statusText}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid option!*\n\nAvailable options:\n- all\n- cmd\n- off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Mread command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_MREAD4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your message read setting!*" }, { quoted: shonux });
  }
  break;
}

case 'autorecording': {
  await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change auto recording.' }, { quoted: shonux });
    }
    
    let q = args[0];
    
    if (q === 'on' || q === 'off') {
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      userConfig.AUTO_RECORDING = (q === 'on') ? "true" : "false";
      
      // If turning on auto recording, turn off auto typing to avoid conflict
      if (q === 'on') {
        userConfig.AUTO_TYPING = "false";
      }
      
      await setUserConfigInMongo(sanitized, userConfig);
      
      // Immediately stop any current recording if turning off
      if (q === 'off') {
        await socket.sendPresenceUpdate('available', sender);
      }
      
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: `✅ *Auto Recording ${q === 'on' ? 'ENABLED' : 'DISABLED'}*` }, { quoted: shonux });
    } else {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING3" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      await socket.sendMessage(sender, { text: "❌ *Invalid! Use:* .autorecording on/off" }, { quoted: shonux });
    }
  } catch (e) {
    console.error('Autorecording error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_RECORDING4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating auto recording!*" }, { quoted: shonux });
  }
  break;
}

case 'prefix': {
  await socket.sendMessage(sender, { react: { text: '🔣', key: msg.key } });
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change prefix.' }, { quoted: shonux });
    }
    
    let newPrefix = args[0];
    if (!newPrefix || newPrefix.length > 2) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX2" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: "❌ *Invalid prefix!*\nPrefix must be 1-2 characters long." }, { quoted: shonux });
    }
    
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    userConfig.PREFIX = newPrefix;
    await setUserConfigInMongo(sanitized, userConfig);
    
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `✅ *Your Prefix updated to: ${newPrefix}*` }, { quoted: shonux });
  } catch (e) {
    console.error('Prefix command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_PREFIX4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error updating your prefix!*" }, { quoted: shonux });
  }
  break;
}

case 'settings': {
  try {
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const senderNum = (nowsender || '').split('@')[0];
    const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    
    if (senderNum !== sanitized && !isOwner(senderNum)) {
      const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS1" },
        message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
      };
      return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can view settings.' }, { quoted: shonux });
    }

    const currentConfig = await loadUserConfigFromMongo(sanitized) || {};
    const botName = currentConfig.botName || BOT_NAME_FANCY;
    
    const settingsText = `
*╭─「 𝗖𝚄𝚁𝚁𝙴𝙽𝚃 𝗦𝙴𝚃𝚃𝙸𝙽𝙶𝚂 」─●●➤*
*│ 🤖  𝐁𝙾𝚃 𝐍𝙰𝙼𝙴:* ${currentConfig.botName || botName}
*│ 🔧  𝐖𝙾𝚁𝙺 𝐓𝚈𝙿𝙴:* ${currentConfig.WORK_TYPE || 'public'}
*│ 🎭  𝐏𝚁𝙴𝚂𝙴𝙽𝚂𝙴:* ${currentConfig.PRESENCE || 'available'}
*│ 👁️  𝐀𝚄𝚃𝙾 𝐒𝚃𝙰𝚃𝚄𝚂 𝐒𝙴𝙴𝙽:* ${currentConfig.AUTO_VIEW_STATUS || 'true'}
*│ ❤️  𝐀𝚄𝚃𝙾 𝐒𝚃𝙰𝚃𝚄𝚂 𝐑𝙴𝙰𝙲𝚃:* ${currentConfig.AUTO_LIKE_STATUS || 'true'}
*│ 📥  𝐀𝚄𝚃𝙾 𝐒𝚃𝙰𝚃𝚄𝚂 𝐒𝙰𝚅𝙴:* ${currentConfig.AUTO_STATUS_SAVE === 'true' ? 'on' : 'off'}
*│ 📞  𝐀𝚄𝚃𝙾 𝐑𝙴𝙹𝙴𝙲𝚃 𝐂𝙰𝙻𝙻:* ${currentConfig.ANTI_CALL || 'off'}
*│ 📖  𝐀𝚄𝚃𝙾 𝐑𝙴𝙰𝙳 𝐌𝙴𝚂𝚂𝙰𝙶𝙴:* ${currentConfig.AUTO_READ_MESSAGE || 'off'}
*│ 🎥  𝐀𝚄𝚃𝙾 𝐑𝙴𝙲𝙾𝚁𝙳𝙸𝙽𝙶:* ${currentConfig.AUTO_RECORDING || 'false'}
*│ ⌨️  𝐀𝚄𝚃𝙾 𝐓𝚈𝙿𝙸𝙽𝙶:* ${currentConfig.AUTO_TYPING || 'false'}
*│ 💬  𝐀𝚄𝚃𝙾 𝐑𝙴𝙿𝙻𝚈:* ${currentConfig.AUTO_REPLY || 'off'}
*│ ✨  𝐀𝚄𝚃𝙾 𝐑𝙴𝙰𝙲𝚃:* ${currentConfig.AUTO_REACT || 'off'}
*│ 🗑️  𝐀𝙽𝚃𝙸 𝙳𝙴𝙻𝙴𝚃𝙴:* ${currentConfig.ANTI_DELETE || 'off'}
*│ 📋  𝐀𝚄𝚃𝙾 𝐂𝙾𝙽𝚃𝙰𝙲𝚃 𝐒𝙰𝚅𝙴:* ${currentConfig.AUTO_CONTACT_SAVE === 'true' ? 'on' : 'off'}
*│ 🏷️  𝐂𝙾𝙽𝚃𝙰𝙲𝚃 𝐍𝙰𝙼𝙴 𝐏𝚁𝙴𝙵𝙸𝚇:* ${currentConfig.CONTACT_SAVE_PREFIX || 'Contact'} (next: #${(currentConfig.CONTACT_SAVE_COUNT || 0) + 1})
*│ 🔣  𝐏𝚁𝙴𝙵𝙸𝚇:* ${currentConfig.PREFIX || '.'}
*│ 🎭  𝐒𝚃𝙰𝚃𝚄𝚂 𝐄𝙼𝙾𝙹𝙸𝚂:* ${(currentConfig.AUTO_LIKE_EMOJI || config.AUTO_LIKE_EMOJI).join(' ')}
*╰──────────────●●➤*

*𝐔se ${currentConfig.PREFIX || '.'}𝐒etting 𝐓o 𝐂hange 𝐒ettings 𝐕ia 𝐌enu*
    `;

    const _settingsNumCard = {
      key: { remoteJid: "status@broadcast", participant: `${sanitized}@s.whatsapp.net`, fromMe: false, id: "META_SETTINGS_NUM" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${botName};;;;\nFN:${botName}\nORG:Status Assistant\nTEL;type=CELL;type=VOICE;waid=${sanitized}:+${sanitized}\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, {
      image: { url: currentConfig.logo || config.KEZU_IMG },
      caption: settingsText
    }, { quoted: _settingsNumCard });
    
  } catch (e) {
    console.error('Settings command error:', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETTINGS2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: "*❌ Error loading settings!*" }, { quoted: shonux });
  }
  break;
}

const { downloadMediaMessage } = require('@whiskeysockets/baileys');

// ... inside your switch/case block


 case 'weather':
    try {
        // Messages in English
        const messages = {
            noCity: "❗ *Please provide a city name!* \n📋 *Usage*: .weather [city name]",
            weather: (data) => `
* 🤖 Status Assistant ᴡᴇᴀᴛʜᴇʀ ʀᴇᴘᴏʀᴛ *

*◈  ${data.name}, ${data.sys.country}  ◈*

*╭──────────●●➤*
*┣ 🌎 𝐓emperature :* ${data.main.temp}°C
*┣ 🌎 𝐅eels 𝐋ike :* ${data.main.feels_like}°C
*┣ 🌎 𝐌in 𝐓emp :* ${data.main.temp_min}°C
*┣ 🌎 𝐌ax 𝐓emp :* ${data.main.temp_max}°C
*┣ 🌎 𝐇umidity :* ${data.main.humidity}%
*┣ 🌎 𝐖eather :* ${data.weather[0].main}
*┣ 🌎 𝐃escription :* ${data.weather[0].description}
*┣ 🌎 𝐖ind 𝐒peed :* ${data.wind.speed} m/s
*┣ 🌎 𝐏ressure :* ${data.main.pressure} hPa
*╰──────────●●➤*

*🤖 Status Assistant*
`,
            cityNotFound: "🚫 *City not found!* \n🔍 Please check the spelling and try again.",
            error: "⚠️ *An error occurred!* \n🔄 Please try again later."
        };

        // Check if a city name was provided
        if (!args || args.length === 0) {
            await socket.sendMessage(sender, { text: messages.noCity });
            break;
        }

        const apiKey = '2d61a72574c11c4f36173b627f8cb177';
        const city = args.join(" ");
        const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

        const response = await axios.get(url);
        const data = response.data;

        // Get weather icon
        const weatherIcon = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        
        await socket.sendMessage(sender, {
            image: { url: weatherIcon },
            caption: messages.weather(data)
        });

    } catch (e) {
        console.log(e);
        if (e.response && e.response.status === 404) {
            await socket.sendMessage(sender, { text: messages.cityNotFound });
        } else {
            await socket.sendMessage(sender, { text: messages.error });
        }
    }
    break;
          
                case 'gossip':
    try {
        
        const response = await fetch('https://api.srihub.store/news/hiru?apikey=dew_BFJBP1gi0pxFIdCasrTqXjeZzcmoSpz4SE4FtG9B');
        if (!response.ok) {
            throw new Error('API එකෙන් news ගන්න බැරි වුණා.බන් 😩');
        }
        const data = await response.json();


        if (!data.status || !data.result || !data.result.title || !data.result.desc || !data.result.link) {
            throw new Error('API එකෙන් ලැබුණු news data වල ගැටලුවක්');
        }


        const { title, desc, date, link } = data.result;


        let thumbnailUrl = 'https://via.placeholder.com/150';
        try {
            
            const pageResponse = await fetch(link);
            if (pageResponse.ok) {
                const pageHtml = await pageResponse.text();
                const $ = cheerio.load(pageHtml);
                const ogImage = $('meta[property="og:image"]').attr('content');
                if (ogImage) {
                    thumbnailUrl = ogImage; 
                } else {
                    console.warn(`No og:image found for ${link}`);
                }
            } else {
                console.warn(`Failed to fetch page ${link}: ${pageResponse.status}`);
            }
        } catch (err) {
            console.warn(`Thumbnail scrape කරන්න බැරි වුණා from ${link}: ${err.message}`);
        }


        await socket.sendMessage(sender, {
            image: { url: thumbnailUrl },
            caption: formatMessage(
                '📰 🤖 Status Assistant නවතම පුවත් 📰',
                `📢 *${title}*\n\n${desc}\n\n🕒 *Date*: ${date || 'තවම ලබාදීලා නැත'}\n🌐 *Link*: ${link}`,
                '🤖 Status Assistant'
            )
        });
    } catch (error) {
        console.error(`Error in 'news' case: ${error.message}`);
        await socket.sendMessage(sender, {
            text: '⚠️ නිව්ස් ගන්න බැරි වුණා සුද්දෝ! 😩 යමක් වැරදුණා වගේ.'
        });
    }
                    break;
// Add these cases to your switch statement, just like the 'song' case

case 'fb':
case 'fbdl':
case 'facebook':
case 'fbd':
case 'fbvideo': {
    try {
        const axios = require('axios');

        // 1. පණිවිඩය සහ URL ලබා ගැනීම (Fb.js style)
        let text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        let url = text.split(" ")[1]; // උදා: .fb <link>

        if (!url) {
            return await socket.sendMessage(sender, { 
                text: '🚫 *Please send a Facebook video link.*\n\nExample: .fb <url>' 
            }, { quoted: msg });
        }

        // 2. Link Validation
        if (!url.includes("facebook.com") && !url.includes("fb.watch")) {
            return await socket.sendMessage(sender, { text: "❌ *Invalid Facebook Link!*" }, { quoted: msg });
        }

        // 3. Bot Name සහ Config Load කිරීම (Fb.js style)
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        // 4. Fake Contact Message සැකසීම (Fb.js style)
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_FB"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        // 5. Reaction එකක් දැමීම
        await socket.sendMessage(sender, { react: { text: "⏳", key: msg.key } });

        // 6. Movanest API හරහා දත්ත ලබා ගැනීම
        const apiRes = await axios.get("https://www.movanest.xyz/v2/fbdown", {
            params: { url: url }
        });

        if (!apiRes.data.status || !apiRes.data.results?.[0]) {
            return await socket.sendMessage(sender, { text: '❌ *Video not found!*' }, { quoted: shonux });
        }

        const result = apiRes.data.results[0];
        const directUrl = result.hdQualityLink || result.normalQualityLink;

        // 7. වීඩියෝව Buffer එකක් ලෙස Download කිරීම (Size check සඳහා)
        const videoRes = await axios.get(directUrl, {
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" }
        });

        const size = (videoRes.data.length / (1024 * 1024)).toFixed(2);

        if (size > 100) {
            return await socket.sendMessage(sender, { text: `❌ *Video too large: ${size} MB*` }, { quoted: shonux });
        }

        // 8. වීඩියෝව යැවීම (🤖 Status Assistant Style Caption සමඟ)
        await socket.sendMessage(sender, {
            video: Buffer.from(videoRes.data),
            mimetype: "video/mp4",
            caption: `╭───「 📍 *${botName}* 」───◆
│
│ 🎬 *Title:* ${result.title || "Facebook Video"}
│ ⚖️ *Size:* ${size} MB
│ 🔗 *Source:* Facebook
│
╰───────────────────────◆

*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}*`,
            contextInfo: {
                externalAdReply: {
                    title: `${botName} FB DOWNLOADER`,
                    body: "ᴅᴏᴡɴʟᴏᴀᴅᴇᴅ ʙʏ 🤖 Status Assistant",
                    thumbnailUrl: result.thumbnail || "https://files.catbox.moe/g6ywiw.jpeg",
                    sourceUrl: url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: shonux });

        // Success Reaction
        await socket.sendMessage(sender, { react: { text: "✅", key: msg.key } });

    } catch (e) {
        console.log(e);
        await socket.sendMessage(sender, { text: '⚠️ *Error downloading Facebook video.*' });
    }
}
break;
case 'apkdownload':
case 'apk': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const id = text.split(" ")[1]; // .apkdownload <id>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        // ✅ Fake Meta contact message
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!id) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please provide an APK package ID.*\n\nExample: .apkdownload com.whatsapp',
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { text: '*⏳ Fetching APK info...*' }, { quoted: shonux });

        // 🔹 Call API
        const apiUrl = `https://tharuzz-ofc-apis.vercel.app/api/download/apkdownload?id=${encodeURIComponent(id)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '*❌ Failed to fetch APK info.*' }, { quoted: shonux });
        }

        const result = data.result;
        const caption = `📱 *${result.name}*\n\n` +
                        `*🆔 𝐏ackage:* \`${result.package}\`\n` +
                        `*📦 𝐒ize:* ${result.size}\n` +
                        `*🕒 𝐋ast 𝐔pdate:* ${result.lastUpdate}\n\n` +
                        `*✅ 𝐃ownloaded 𝐁y:* ${botName}`;

        // 🔹 Send APK as document
        await socket.sendMessage(sender, {
            document: { url: result.dl_link },
            fileName: `${result.name}.apk`,
            mimetype: 'application/vnd.android.package-archive',
            caption: caption,
            jpegThumbnail: result.image ? await axios.get(result.image, { responseType: 'arraybuffer' }).then(res => Buffer.from(res.data)) : undefined
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in APK download:", err);

        // Catch block Meta mention
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_APKDL"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
// ✅ Handle reply for downloading selected video
case 'alive': {
  try {
    // 1. Add Reaction (Immediate Feedback)
    await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || '🤖 Status Assistant'; // Default fancy name
    const logo = cfg.logo || config.KEZU_IMG;

    // 2. Calculate Uptime
    const startTime = socketCreationTime.get(number) || Date.now();
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    // 3. (metaQuote removed — no fake link preview)
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_ALIVE" },
      message: { contactMessage: { displayName: "🟢 ᴏɴʟɪɴᴇ", vcard: `BEGIN:VCARD
VERSION:3.0
N:;${botName};;;
FN:${botName}
ORG:Bot System
END:VCARD` } }
    };

    // 4. Beautiful & Art-full Caption Style
    const text = `
╭ *${botName}* 
┃
┃ 👋 *𝐇𝐞𝐲 𝐓𝐡𝐞𝐫𝐞! 𝐈 𝐀𝐦 𝐀𝐥𝐢𝐯𝐞 𝐍𝐨𝐰.*
┃    _Always ready to assist you!_
┃
┃ 👤 *𝐔𝐬𝐞𝐫:* @${sender.split('@')[0]}
┃ 👑 *𝐎𝐰𝐧𝐞𝐫:* ${config.OWNER_NAME || 'Status Assistant'}
┃ ⏳ *𝐔𝐩𝐭𝐢𝐦𝐞:* ${hours}ʜ ${minutes}ᴍ ${seconds}ꜱ
┃ 🚀 *𝐕𝐞𝐫𝐬𝐢𝐨𝐧:* 2.0.0 (Pro)
┃ 💻 *𝐇𝐨𝐬𝐭:* ${process.env.PLATFORM || 'Heroku'}
┃
╰━━━━━━━━━━━━━━┈⊷
> *© 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 🤖 Status Assistant 🍃*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text + `\n\n> *${config.PREFIX}menu* | *${config.PREFIX}ping*`,
      footer: `*${botName} 2026*`,
      mentions: [sender]
    }, { quoted: msg });

  } catch(e) {
    console.error('Alive command error:', e);
    await socket.sendMessage(sender, { text: '❌ An error occurred in alive command.' }, { quoted: msg });
  }
  break;
}

// ─────────────────── SETOWNER ───────────────────────────────────
case 'setowner': {
  try {
    await socket.sendMessage(sender, { react: { text: '👑', key: msg.key } });

    const _sanSO = (number || '').replace(/[^0-9]/g, '');

    // Get the connected bot's own number and display name
    const botJid = jidNormalizedUser(socket.user.id);
    const botNum = botJid.split('@')[0];
    let botDisplayName = '';
    try {
      const [profile] = await socket.onWhatsApp(botJid);
      botDisplayName = profile?.name || socket.user.name || botNum;
    } catch(e) {
      botDisplayName = socket.user?.name || botNum;
    }

    // args[0] = custom name (optional)
    const customName = args.join(' ').trim() || botDisplayName || botNum;

    // Load current config and merge
    const _currentCfg = await loadUserConfigFromMongo(_sanSO) || {};
    const _newCfg = {
      ..._currentCfg,
      OWNER_NUMBER: botNum,
      ownerName: customName,
      botName: _currentCfg.botName || '🤖 Status Assistant'
    };
    await setUserConfigInMongo(_sanSO, _newCfg);

    await socket.sendMessage(sender, {
      text: `👑 *Owner Updated Successfully!*\n\n*📱 Number:* ${botNum}\n*👤 Name:* ${customName}\n\n_Bot is now linked to this number._`
    }, { quoted: msg });

  } catch(e) {
    console.error('[SETOWNER] error:', e.message);
    await socket.sendMessage(sender, { text: `❌ setowner error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ---------------------- PING ----------------------
case 'ping': {
  try {
    
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    
    await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

    // Send the initial "Loading" message
    const loadingText = `*𝙿𝚒𝚗𝚐𝚒𝚗𝚐...*`;
    const { key } = await socket.sendMessage(sender, { text: loadingText }, { quoted: msg });

    // 🔄 Animation Sequence (Edit the message to create a bar)
    const frames = [
      '◜    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◠    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◝    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◞    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◡    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◟    𝚕𝚘𝚊𝚍𝚒𝚗𝚐.',
'◌    𝚜𝚞𝚌𝚌𝚎𝚜𝚜!'
    ];

    for (let frame of frames) {
      await socket.sendMessage(sender, { text: `*ᴀɴᴀʟʏᴢɪɴɢ ɴᴇᴛᴡᴏʀᴋ...*
${frame}`, edit: key });
      await sleep(500); // 0.5s delay between frames
    }

    // =================================================================
    // 📊 2. REAL DATA PROCESSING
    // =================================================================
    const start = Date.now();
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || "🤖 Status Assistant";
    const logo = cfg.logo || config.KEZU_IMG;

    // Latency Calculation
    const end = Date.now();
    const latency = end - start; 
    const finalLatency = latency > 0 ? latency : Math.floor(Math.random() * 50) + 10;

    // Tech Stats
    const memory = process.memoryUsage();
    const ramUsage = (memory.rss / 1024 / 1024).toFixed(2); 
    const totalMem = 4096; 
    
    // =================================================================
    // 🖼️ 3. FINAL ARTFUL CARD (The "Result")
    // =================================================================
    const text = `
╭ *${botName}* 
┃
┃ 🌿 *ᴘɪɴɢ* : ${finalLatency} ᴍꜱ
┃ 💾 *ʀᴀᴍ*  : ${ramUsage} / ${totalMem} ᴍʙ
┃ 🍷 *ᴛʏᴘᴇ* : ${config.WORK_TYPE || 'ᴘᴜʙʟɪᴄ'}
┃ 📅 *ᴅᴀᴛᴇ* : ${new Date().toLocaleDateString('en-GB')}
┃
╰━━〔 *${config.OWNER_NAME || '🤖 Status Assistant'}* 〕━━┈⊷

   *🚀 ꜱʏꜱᴛᴇᴍ ɪꜱ ʀᴜɴɴɪɴɢ ꜱᴍᴏᴏᴛʜʟʏ*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    // Final "Done" Reaction
    await socket.sendMessage(sender, { react: { text: '🌿', key: msg.key } });

    // Send the final Image Card
    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text + `\n\n> *${config.PREFIX}menu* | *${config.PREFIX}alive*`,
      footer: `*© ᴘᴏᴡᴇʀᴇᴅ ʙʏ 🤖 Status Assistant*`,
    }, { quoted: msg });

    // Optional: Delete the loading message to keep chat clean
    // await socket.sendMessage(sender, { delete: key }); 

  } catch (e) {
    console.error('Ping command error:', e);
    await socket.sendMessage(sender, { text: '❌ *Error in Loading Sequence.*' }, { quoted: msg });
  }
  break;
}

// ─────────────────── LIST — All Commands ────────────────────────
case 'list':
case 'cmds':
case 'commands': {
  try {
    await socket.sendMessage(sender, { react: { text: '📋', key: msg.key } });
    const _listSan = (number || '').replace(/[^0-9]/g, '');
    const _listCfg = await loadUserConfigFromMongo(_listSan) || {};
    const _listBot = _listCfg.botName || '🤖 Status Assistant';
    const _p = _listCfg.PREFIX || config.PREFIX || '.';

    const listText = `
╭━━━━━━━━━━━━━━━━━━━╮
│ 📋 *𝗔𝗟𝗟 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦*
╰━━━━━━━━━━━━━━━━━━━╯

*📥 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗖𝗠𝗗𝗦*
┃ ${_p}song [name/url] — YouTube Audio
┃ ${_p}video [name/url] — YouTube Video
┃ ${_p}fb [url] — Facebook Video
┃ ${_p}insta [url] — Instagram Media
┃ ${_p}tiktok [url] — TikTok Video
┃ ${_p}mf [url] — MediaFire Download
┃ ${_p}apk [package] — Android APK
┃ ${_p}splotify [url] — Spotify Track
┃ ${_p}csong [name] — Song to Channel
┃ ${_p}cvid [url] — Video to Channel

*🤖 𝗔𝗨𝗧𝗢 𝗖𝗠𝗗𝗦 (on/off)*
┃ ${_p}autotyping on/off
┃ ${_p}autorecording on/off
┃ ${_p}autoreact on/off
┃ ${_p}autoreply on/off
┃ ${_p}statusdl on/off
┃ ${_p}vvsave on/off
┃ ${_p}autocsave on/off
┃ ${_p}vidnote on/off
┃ ${_p}autosong jid,title,time / off
┃ ${_p}autottsend jid,title,time / off

*🛡️ 𝗔𝗡𝗧𝗜 𝗖𝗠𝗗𝗦 (on/off)*
┃ ${_p}antiban on/off
┃ ${_p}antispam on/off
┃ ${_p}antibug on/off
┃ ${_p}antilink on/off
┃ ${_p}antidelete on/off
┃ ${_p}creject on/off

*⚙️ 𝗦𝗘𝗧𝗧𝗜𝗡𝗚𝗦 𝗖𝗠𝗗𝗦*
┃ ${_p}setting — Interactive Settings Menu
┃ ${_p}settings — View Current Settings
┃ ${_p}wtype public/private/groups/inbox
┃ ${_p}botpresence online/offline
┃ ${_p}mread all/cmd/off
┃ ${_p}prefix [char] — Change Prefix
┃ ${_p}setbotname [name]
┃ ${_p}setlogo — Reply image to set logo
┃ ${_p}setmenuvideo [url]
┃ ${_p}setowner [number]

*🎭 𝗧𝗢𝗢𝗟𝗦 & 𝗨𝗧𝗜𝗟𝗜𝗧𝗬*
┃ ${_p}weather [city]
┃ ${_p}getdp @user
┃ ${_p}vv — View Once Unlock
┃ ${_p}save — Save Media
┃ ${_p}dl [url] — Save & Download

*👑 𝗦𝗬𝗦𝗧𝗘𝗠 𝗖𝗠𝗗𝗦*
┃ ${_p}menu — Main Menu
┃ ${_p}alive — Bot Status
┃ ${_p}ping — Ping Bot
┃ ${_p}system — System Info
┃ ${_p}owner — Owner Info
┃ ${_p}active — Active Sessions
┃ ${_p}list — This Command List

> *🤖 ${_listBot}*
`.trim();

    const _listCard = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_LIST1" },
      message: { contactMessage: { displayName: _listBot, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${_listBot};;;;\nFN:${_listBot}\nORG:Status Assistant\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, {
      image: { url: _listCfg.logo || config.KEZU_IMG },
      caption: listText
    }, { quoted: _listCard });
    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
  } catch (e) {
    console.error('List command error:', e);
    await socket.sendMessage(sender, { text: '❌ *Error loading command list.*' }, { quoted: msg });
  }
  break;
}

// ─────────────────── VV — Save View-Once ────────────────────────
case 'vv':
case 'viewonce':
case 'antiviewonce': {
  try {
    await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });

    const _sanVV = (number || '').replace(/[^0-9]/g, '');
    const _cfgVV = await loadUserConfigFromMongo(_sanVV) || {};
    const _botVV = _cfgVV.botName || '🤖 Status Assistant';

    // Must be a reply to a view-once message
    const quotedCtx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedMsg = quotedCtx?.quotedMessage;

    if (!quotedMsg) {
      await socket.sendMessage(sender, {
        text: `❌ *View-Once message හොයාගන්න බැරිවුනා!*\n\n› View-once message එකට reply කරලා *.vv* type කරන්න.\n\n> *${_botVV}*`
      }, { quoted: msg });
      break;
    }

    // Detect the inner type inside view-once wrapper
    let voInner = null;
    let voType = null;
    const voWrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
    for (const w of voWrappers) {
      if (quotedMsg[w]) { voInner = quotedMsg[w].message; break; }
    }
    // Also handle direct media in quoted (some clients strip wrapper)
    if (!voInner) voInner = quotedMsg;

    if (!voInner) {
      await socket.sendMessage(sender, { text: `❌ *Media ලබාගන්න බැරිවුනා.*\n\n> *${_botVV}*` }, { quoted: msg });
      break;
    }

    voType = getContentType(voInner);

    if (!voType || !['imageMessage', 'videoMessage', 'audioMessage'].includes(voType)) {
      await socket.sendMessage(sender, {
        text: `❌ *Supported නෑ!*\n\n› Image, Video, Audio view-once messages only.\n\n> *${_botVV}*`
      }, { quoted: msg });
      break;
    }

    const mediaData = voInner[voType];
    const mediaTypeStr = voType.replace('Message', '');
    const stream = await downloadContentFromMessage(mediaData, mediaTypeStr);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

    const fromNum = (quotedCtx?.participant || quotedCtx?.remoteJid || msg.key.remoteJid || '').split('@')[0];
    const vvCaption = `╭━━━━━━━━━━━━━━━╮\n┃  👁️ *𝗩𝗜𝗘𝗪 𝗢𝗡𝗖𝗘 𝗦𝗔𝗩𝗘𝗗*\n╰━━━━━━━━━━━━━━━╯\n\n┃ 👤 *𝗙𝗿𝗼𝗺 :* +${fromNum}\n┃ 📁 *𝗧𝘆𝗽𝗲 :* ${mediaTypeStr}\n\n> *${_botVV}*`;

    if (voType === 'imageMessage') {
      await socket.sendMessage(sender, { image: buffer, caption: vvCaption }, { quoted: msg });
    } else if (voType === 'videoMessage') {
      await socket.sendMessage(sender, { video: buffer, caption: vvCaption }, { quoted: msg });
    } else if (voType === 'audioMessage') {
      await socket.sendMessage(sender, {
        audio: buffer,
        mimetype: mediaData.mimetype || 'audio/ogg; codecs=opus',
        ptt: mediaData.ptt || false
      }, { quoted: msg });
    }

  } catch (e) {
    console.error('vv cmd error:', e);
    await socket.sendMessage(sender, { text: '❌ *View-once save වෙද්දී error එකක් උනා.*' }, { quoted: msg });
  }
  break;
}

// ─────────────────── SAVE — Save Quoted Media ───────────────────
case 'save':
case 'savemedia':
case 'dl': {
  try {
    await socket.sendMessage(sender, { react: { text: '💾', key: msg.key } });

    const _sanSave = (number || '').replace(/[^0-9]/g, '');
    const _cfgSave = await loadUserConfigFromMongo(_sanSave) || {};
    const _botSave = _cfgSave.botName || '🤖 Status Assistant';

    const saveCtx = msg.message?.extendedTextMessage?.contextInfo;
    const saveQuoted = saveCtx?.quotedMessage;

    if (!saveQuoted) {
      await socket.sendMessage(sender, {
        text: `❌ *Save කරන්න media message එකට reply කරන්න!*\n\n› Status, image, video, audio message එකට reply කරලා *.save* type කරන්න.\n\n> *${_botSave}*`
      }, { quoted: msg });
      break;
    }

    // Unwrap view-once or ephemeral wrappers if needed
    let saveInner = saveQuoted;
    const saveWrappers = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'ephemeralMessage'];
    for (const w of saveWrappers) {
      if (saveQuoted[w]) { saveInner = saveQuoted[w].message || saveQuoted[w]; break; }
    }

    const saveType = getContentType(saveInner);
    const supportedTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];

    if (!saveType || !supportedTypes.includes(saveType)) {
      await socket.sendMessage(sender, {
        text: `❌ *Supported media type නෑ!*\n\n› Image / Video / Audio / Document / Sticker.\n\n> *${_botSave}*`
      }, { quoted: msg });
      break;
    }

    const saveMediaData = saveInner[saveType];
    const saveTypeStr = saveType.replace('Message', '');
    const saveStream = await downloadContentFromMessage(saveMediaData, saveTypeStr);
    let saveBuf = Buffer.from([]);
    for await (const chunk of saveStream) saveBuf = Buffer.concat([saveBuf, chunk]);

    const saveFrom = (saveCtx?.participant || saveCtx?.remoteJid || '').split('@')[0];
    const saveCaption = `╭━━━━━━━━━━━━━━━╮\n┃  💾 *𝗦𝗔𝗩𝗘𝗗 𝗠𝗘𝗗𝗜𝗔*\n╰━━━━━━━━━━━━━━━╯\n\n┃ 👤 *𝗙𝗿𝗼𝗺 :* +${saveFrom}\n┃ 📁 *𝗧𝘆𝗽𝗲 :* ${saveTypeStr}\n\n> *${_botSave}*`;

    if (saveType === 'imageMessage') {
      await socket.sendMessage(sender, { image: saveBuf, caption: saveCaption }, { quoted: msg });
    } else if (saveType === 'videoMessage') {
      await socket.sendMessage(sender, { video: saveBuf, caption: saveCaption }, { quoted: msg });
    } else if (saveType === 'audioMessage') {
      await socket.sendMessage(sender, {
        audio: saveBuf,
        mimetype: saveMediaData.mimetype || 'audio/ogg; codecs=opus',
        ptt: saveMediaData.ptt || false
      }, { quoted: msg });
    } else if (saveType === 'documentMessage') {
      await socket.sendMessage(sender, {
        document: saveBuf,
        mimetype: saveMediaData.mimetype || 'application/octet-stream',
        fileName: saveMediaData.fileName || 'file'
      }, { quoted: msg });
    } else if (saveType === 'stickerMessage') {
      await socket.sendMessage(sender, { sticker: saveBuf }, { quoted: msg });
    }

  } catch (e) {
    console.error('save cmd error:', e);
    await socket.sendMessage(sender, { text: '❌ *Save වෙද්දී error එකක් උනා.*' }, { quoted: msg });
  }
  break;
}

// ─────────────────── GET DP ──────────────────────────────────────
case 'getdp': {
  try {
    await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });

    const sanitizedOwn = (number || '').replace(/[^0-9]/g, '');
    const cfgDp = await loadUserConfigFromMongo(sanitizedOwn) || {};
    const botNameDp = cfgDp.botName || '🤖 Status Assistant';

    // ── Resolve target JID ──
    // Priority: 1) @mention  2) quoted msg sender  3) args (typed number)  4) self
    let targetJid = null;

    const mentionedList = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
      || msg.message?.imageMessage?.contextInfo?.mentionedJid
      || [];

    if (mentionedList.length > 0) {
      targetJid = mentionedList[0];
    } else if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
      targetJid = msg.message.extendedTextMessage.contextInfo.participant;
    } else if (args[0]) {
      const rawNum = args[0].replace(/[^0-9]/g, '');
      if (rawNum.length > 4) targetJid = `${rawNum}@s.whatsapp.net`;
    }

    if (!targetJid) targetJid = nowsender;

    const targetNum = targetJid.split('@')[0];

    // ── Fetch DP ──
    let dpUrl = null;
    try {
      dpUrl = await socket.profilePictureUrl(targetJid, 'image');
    } catch (e) {
      dpUrl = null;
    }

    if (!dpUrl) {
      await socket.sendMessage(sender, {
        text: `❌ *DP ලබාගන්න බැරිවුනා!*\n\n› Profile picture hidden or not set.\n› *Number:* @${targetNum}\n\n> *${botNameDp}*`,
        mentions: [targetJid]
      }, { quoted: msg });
      break;
    }

    const caption = `
╭━━━━━━━━━━━━━━━━╮
┃  🖼️ *𝗣𝗥𝗢𝗙𝗜𝗟𝗘 𝗣𝗜𝗖𝗧𝗨𝗥𝗘*
╰━━━━━━━━━━━━━━━━╯

┃ 👤 *𝗨𝘀𝗲𝗿 :* @${targetNum}
┃ 📱 *𝗡𝘂𝗺𝗯𝗲𝗿 :* +${targetNum}
┃ ✅ *𝗦𝘁𝗮𝘁𝘂𝘀 :* DP Found

> *${botNameDp}*
`.trim();

    await socket.sendMessage(sender, {
      image: { url: dpUrl },
      caption: caption + `\n\n> *${config.PREFIX}getdp* to get another DP`,
      mentions: [targetJid],
      contextInfo: {
        mentionedJid: [targetJid],
        externalAdReply: {
          title: `@${targetNum}`,
          body: 'Profile Picture',
          thumbnailUrl: dpUrl,
          sourceUrl: dpUrl,
          mediaType: 1,
          renderLargerThumbnail: true
        }
      }
    }, { quoted: msg });

  } catch (e) {
    console.error('getdp error:', e);
    await socket.sendMessage(sender, { text: '❌ *DP ගන්නකොට error එකක් උනා.*' }, { quoted: msg });
  }
  break;
}
// ─────────────────────────────────────────────────────────────────
// ─── AUTO TIKTOK SEND ───────────────────────────────────────────
case 'autottsend': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || '🤖 Status Assistant';

    const argText = (args.join(' ') || '').trim();

    // ── OFF ──
    if (argText.toLowerCase() === 'off') {
      stopAllAutoTTSend(sanitizedNum);
      await removeAutoTTSend(sanitizedNum);
      await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
      await socket.sendMessage(sender, {
        text: `🛑 *AutoTTSend Disabled*\n\nAll auto TikTok sending has been stopped.\n\n> *🤖 Status Assistant*`
      }, { quoted: msg });
      break;
    }

    // ── SET ── usage: autottsend jid,title,time
    const parts2 = argText.split(',');
    if (parts2.length < 2) {
      await socket.sendMessage(sender, {
        text: `❌ *Wrong Usage!*\n\n*Usage:* \`.autottsend jid,title,time\`\n*Example:* \`.autottsend 120363402094635383@newsletter,funny cats,15\`\n_(time = minutes, default 10)_\n\nTo turn off: \`.autottsend off\`\n\n> *🤖 Status Assistant*`
      }, { quoted: msg });
      break;
    }

    let rawLink = parts2[0].trim();
    // Time is last part if it's a number, title is everything in between
    let ttIntervalMin = 10;
    let titleParts2 = parts2.slice(1);
    if (titleParts2.length >= 2) {
      const lastPart = titleParts2[titleParts2.length - 1].trim();
      if (/^\d+$/.test(lastPart)) {
        ttIntervalMin = parseInt(lastPart, 10);
        titleParts2 = titleParts2.slice(0, -1);
      }
    }
    const title2 = titleParts2.join(',').trim();

    if (!title2) {
      await socket.sendMessage(sender, { text: '❌ Please provide a title/keyword after the JID.' }, { quoted: msg });
      break;
    }
    if (ttIntervalMin < 1) ttIntervalMin = 1;

    // ── Resolve JID ──
    let targetJid = rawLink;

    if (rawLink.includes('chat.whatsapp.com/')) {
      const inviteCode = rawLink.split('chat.whatsapp.com/')[1]?.split(/[?&]/)[0];
      try {
        const info = await socket.groupGetInviteInfo(inviteCode);
        targetJid = info.id;
      } catch(e) {
        await socket.sendMessage(sender, { text: `❌ Could not resolve group link. Try using the JID directly (e.g. 120363402094635383@newsletter)` }, { quoted: msg });
        break;
      }
    } else if (!targetJid.includes('@')) {
      if (/^\d+$/.test(targetJid)) targetJid = `${targetJid}@newsletter`;
      else {
        await socket.sendMessage(sender, { text: `❌ Invalid JID. Use @newsletter or @g.us format.` }, { quoted: msg });
        break;
      }
    }

    // ── Save & Start ──
    await addAutoTTSend(sanitizedNum, targetJid, title2, ttIntervalMin);
    startAutoTTSendInterval(socket, sanitizedNum, targetJid, title2, botName2, ttIntervalMin);

    // Send one immediately
    sendAutoTTVideo(socket, targetJid, title2, botName2).catch(e => console.error('AutoTTSend immediate error:', e.message));

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `✅ *AutoTTSend Enabled!*\n\n🎯 *Target:* ${targetJid}\n🔍 *Keyword:* ${title2}\n⏱️ *Interval:* Every ${ttIntervalMin} minute(s)\n\nTo stop: \`.autottsend off\`\n\n> *🤖 Status Assistant*`
    }, { quoted: msg });

  } catch(e) {
    console.error('autottsend error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ─────────────── CHANREACT (Channel Auto Reaction) ────────────────────────────
// ─────────────── STOP REACT (Stop channel auto reaction) ──────────────────────
// ─────────────── CSONG (Send Song to Channel) ─────────────────────────────────
// ─────────────── AUTOSONG (Auto Send Songs to Channel every 30min) ─────────────
case 'autosong': {
  try {
    const sanitizedNum = (number || '').replace(/[^0-9]/g, '');
    const cfg2 = await loadUserConfigFromMongo(sanitizedNum) || {};
    const botName2 = cfg2.botName || BOT_NAME_FANCY;

    const argText = (args.join(' ') || '').trim();

    if (argText.toLowerCase() === 'off') {
      stopAutoSongForNumber(sanitizedNum);
      await removeAutoSongSend(sanitizedNum);
      await socket.sendMessage(sender, { react: { text: '🛑', key: msg.key } });
      await socket.sendMessage(sender, {
        text: `🛑 *AutoSong Disabled*\n\nAuto song sending has been stopped.\n\n> *🤖 Status Assistant*`
      }, { quoted: msg });
      break;
    }

    const songParts = argText.split(',');
    if (songParts.length < 2) {
      await socket.sendMessage(sender, {
        text: `❌ *Wrong Usage!*\n\n*Usage:* \`.autosong jid,song title,time\`\n*Example:* \`.autosong 120363402094635383@newsletter,Shape of You,30\`\n_(time = minutes, default 30)_\n\nTo stop: \`.autosong off\`\n\n> *🤖 Status Assistant*`
      }, { quoted: msg });
      break;
    }

    let targetJid = songParts[0].trim();
    let songIntervalMin = 30;
    let songTitleParts = songParts.slice(1);
    if (songTitleParts.length >= 2) {
      const lastSongPart = songTitleParts[songTitleParts.length - 1].trim();
      if (/^\d+$/.test(lastSongPart)) {
        songIntervalMin = parseInt(lastSongPart, 10);
        songTitleParts = songTitleParts.slice(0, -1);
      }
    }
    const songTitle2 = songTitleParts.join(',').trim();

    if (!targetJid.endsWith('@newsletter') && !targetJid.endsWith('@g.us')) {
      if (/^\d+$/.test(targetJid)) targetJid = `${targetJid}@newsletter`;
    }
    if (!targetJid.includes('@')) {
      await socket.sendMessage(sender, { text: `❌ Invalid JID. Use a channel JID (@newsletter) or group JID (@g.us).` }, { quoted: msg });
      break;
    }
    if (!songTitle2) {
      await socket.sendMessage(sender, { text: `❌ Please provide a song title after the JID.` }, { quoted: msg });
      break;
    }
    if (songIntervalMin < 1) songIntervalMin = 1;

    await addAutoSongSend(sanitizedNum, targetJid, songTitle2, songIntervalMin);
    startAutoSongInterval(socket, sanitizedNum, targetJid, songTitle2, botName2, songIntervalMin);

    sendAutoSong(socket, targetJid, songTitle2, botName2).catch(e => console.error('AutoSong immediate error:', e.message));

    await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });
    await socket.sendMessage(sender, {
      text: `✅ *AutoSong Enabled!*\n\n📡 *Target:* ${targetJid}\n🎵 *Song:* ${songTitle2}\n⏱️ *Interval:* Every ${songIntervalMin} minute(s)\n\nTo stop: \`.autosong off\`\n\n> *🤖 Status Assistant*`
    }, { quoted: msg });

  } catch(e) {
    console.error('autosong error:', e);
    await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg });
  }
  break;
}

// ---------------------- BOOM ----------------------
// ---------------------- HACK ----------------------
case 'activesessions':
case 'active':
case 'bots': {
  try {
    // ------------------------------------------------------------------
    // 1. SETUP & SAFETY VARIABLES
    // ------------------------------------------------------------------
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Safety: Ensure we have a valid key to react to
    const targetKey = (msg && msg.key) ? msg.key : null;
    
    // Safety: Ensure 'sender' is defined
    const safeSender = sender || (msg && msg.key && msg.key.remoteJid) || '';
    if (!safeSender) break; 

    // React immediately 
    try { if(targetKey) await socket.sendMessage(safeSender, { react: { text: "📍", key: targetKey } }); } catch(e) {}

    // ------------------------------------------------------------------
    // 2. ADVANCED LOADING SEQUENCE (Fixed Strings)
    // ------------------------------------------------------------------
    
    // Send Initial "Booting" Message
    let loadMsg;
    try {
        loadMsg = await socket.sendMessage(safeSender, { 
            text: `🔄 *🤖 Status Assistant 𝐒𝐘𝐒𝐓𝐄𝐌𝐒...*` 
        }, { quoted: msg });
    } catch (e) {
        console.log("Error sending load message:", e);
        break; 
    }

    const loadKey = loadMsg.key;

    // Animation 1: Connection (Using backticks to prevent SyntaxError)
    await sleep(500);
    await socket.sendMessage(safeSender, { 
        text: `📡 *Connecting to 🤖 Status Assistant Server...*
[▢▢▢▢▢] 0%`, 
        edit: loadKey 
    });

    // ------------------------------------------------------------------
    // 3. SECURE CONFIGURATION LOADING
    // ------------------------------------------------------------------
    
    const currentNumber = (typeof number !== 'undefined' ? number : '').replace(/[^0-9]/g, '');
    
    let cfg = {};
    try {
        if (typeof loadUserConfigFromMongo === 'function') {
            cfg = await loadUserConfigFromMongo(currentNumber) || {};
        }
    } catch (err) {
        console.warn("MongoDB Config Load Failed:", err);
    }

    const botName = "🤖 Status Assistant";
    const defaultLogo = "https://files.catbox.moe/begcjv.png";
    const configLogo = cfg.logo || (typeof config !== 'undefined' ? config.KEZU_IMG : null);

    // Animation 2: Security Check
    await sleep(700);
    await socket.sendMessage(safeSender, { 
        text: `🔐 *Checking Admin Privileges...*
[▣▣▢▢▢] 40%`, 
        edit: loadKey 
    });

    // ------------------------------------------------------------------
    // 4. ROBUST PERMISSION SYSTEM
    // ------------------------------------------------------------------
    
    let isAdmin = false;
    let isOwnerSafe = (typeof isBotOrOwner !== 'undefined' ? isBotOrOwner : false);

    try {
        const dbAdmins = (typeof loadAdminsFromMongo === 'function') ? await loadAdminsFromMongo() : [];
        const normalizedAdmins = (dbAdmins || []).map(a => (a || '').toString().replace(/[^0-9]/g, ''));
        
        const senderNum = safeSender.split('@')[0];
        const realOwnerNum = (typeof nowsender !== 'undefined' ? nowsender : safeSender).split('@')[0];
        
        isAdmin = normalizedAdmins.includes(senderNum) || normalizedAdmins.includes(realOwnerNum);
    } catch (err) {
        console.error("Admin check error:", err);
    }

    if (!isOwnerSafe && !isAdmin) {
        await socket.sendMessage(safeSender, { 
            text: `❌ *ACCESS DENIED*
${botName} Protects This Data.
[FAIL❌] FAILED`, 
            edit: loadKey 
        });
        if(targetKey) await socket.sendMessage(safeSender, { react: { text: "🚫", key: targetKey } });
        break; 
    }

    // ------------------------------------------------------------------
    // 5. SESSION DATA RETRIEVAL
    // ------------------------------------------------------------------
    
    // Animation 3: Scanning
    await sleep(600);
    await socket.sendMessage(safeSender, { 
        text: `🔍 *Scanning Active Sessions...*
[▣▣▣▣▢] 80%`, 
        edit: loadKey 
    });

    let activeCount = 0;
    let activeNumbers = [];
    
    try {
        let mapSource = null;
        if (typeof activeSockets !== 'undefined' && activeSockets instanceof Map) {
            mapSource = activeSockets;
        } else if (typeof global.activeSockets !== 'undefined' && global.activeSockets instanceof Map) {
            mapSource = global.activeSockets;
        }

        if (mapSource) {
            activeCount = mapSource.size;
            activeNumbers = Array.from(mapSource.keys());
        }
    } catch (e) {
        console.log("Error reading sockets:", e);
    }

    // Animation 4: Complete
    await sleep(500);
    await socket.sendMessage(safeSender, { 
        text: `✅ *${botName} Data Retrieved!*
[▣▣▣▣▣] 100%`, 
        edit: loadKey 
    });
    
    await sleep(500);
    await socket.sendMessage(safeSender, { delete: loadKey }); 

    // ------------------------------------------------------------------
    // 6. FINAL DASHBOARD GENERATION
    // ------------------------------------------------------------------
    
    if(targetKey) await socket.sendMessage(safeSender, { react: { text: "🕵️‍♂️", key: targetKey } });

    const getSLTime = () => {
        try {
            return new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo', hour12: true, hour: 'numeric', minute: 'numeric', second: 'numeric' });
        } catch (e) {
            return new Date().toLocaleTimeString();
        }
    };

    const time = getSLTime();
    const date = new Date().toLocaleDateString();

    // Using backticks for the main text block too
    let text = `╭─── [ 📍 *${botName}* ] ───
│
│ 📡 *𝚂𝚝𝚊𝚝𝚞𝚜:* 🟢 𝙾𝚗𝚕𝚒𝚗𝚎
│ 📊 *𝙰𝚌𝚝𝚒𝚟𝚎 𝚄𝚜𝚎𝚛𝚜:* ${activeCount}
│ 📅 *𝙳𝚊𝚝𝚎:* ${date}
│ ⌚ *𝚃𝚒𝚖𝚎:* ${time}
│`;

    if (activeCount > 0) {
        text += `
│ 📱 *𝙲𝚘𝚗𝚗𝚎𝚌𝚝𝚎𝚍 𝚂𝚎𝚜𝚜𝚒𝚘𝚗𝚜:*`;
        activeNumbers.forEach((num, index) => {
            text += `
│    ${index + 1}. 👤:${num}`; 
        });
    } else {
        text += `
│ ⚠️ 𝙽𝚘 𝚊𝚌𝚝𝚒𝚟𝚎 𝚜𝚎𝚜𝚜𝚒𝚘𝚗𝚜.`;
    }
    
    text += `
│
╰──────────────────────`;

    let imagePayload = { url: defaultLogo }; 
    
    if (configLogo) {
        if (String(configLogo).startsWith('http')) {
            imagePayload = { url: configLogo };
        } else {
            try {
                const fs = require('fs'); 
                if (fs.existsSync(configLogo)) {
                    imagePayload = fs.readFileSync(configLogo);
                }
            } catch (e) {
                console.log("Local logo not found, using default.");
            }
        }
    }

    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "🤖 Status Assistant_STATUS" },
      message: { 
        contactMessage: { 
          displayName: botName, 
          vcard: `BEGIN:VCARD
VERSION:3.0
N:XMD;🤖 Status Assistant;;
FN:${botName}
ORG:🤖 Status Assistant Systems
TEL;type=CELL;type=VOICE;waid=94700000000:+94 70 000 0000
END:VCARD` 
        } 
      }
    };

    const prefix = (typeof config !== 'undefined' && config.PREFIX) ? config.PREFIX : '.';

    await socket.sendMessage(safeSender, {
      image: imagePayload,
      caption: text,
      footer: `📍 🤖 Status Assistant 𝐒𝐘𝐒𝐓𝐄𝐌`,
      contextInfo: {
        externalAdReply: {
          title: `${botName} 𝐌𝐨𝐧𝐢𝐭𝐨𝐫`,
          body: `📍 𝐏𝐨𝐰𝐞𝐫𝐞𝐝 𝐁𝐲 🤖 Status Assistant`,
          previewType: "PHOTO",
          thumbnailUrl: String(imagePayload.url || defaultLogo), 
          sourceUrl: "https://whatsapp.com/channel/00O",
          mediaType: 1,
          renderLargerThumbnail: true
        }
      },
    }, { quoted: metaQuote });

  } catch(globalError) {
    console.error('ActiveSessions CRITICAL FAILURE:', globalError);
    try {
        await socket.sendMessage(sender, { 
            text: '❌ *🤖 Status Assistant Error:* An unexpected system error occurred.' 
        }, { quoted: msg });
    } catch (e) {}
  }
  break;
}
case 'song':
case 'play':
case 'audio':
case 'ytmp3':
    if (!args.length) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n*Need YouTube URL or Song Title*'
        }, { quoted: msg });
        break;
    }

    const lakiya = args.join(' ');
    await socket.sendMessage(sender, { text: '🔍 Searching song...' });

    try {
        let data;

  
        if (lakiya.match(/(youtube\.com|youtu\.be)/)) {
            const match = lakiya.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
            const videoId = match ? match[1] : null;

            if (!videoId) throw new Error('Invalid YouTube URL');

            const result = await yts({ videoId });
            data = result;
        } else {
            const result = await yts(lakiya);

            if (!result.videos || result.videos.length === 0) {
                await socket.sendMessage(sender, {
                    text: '❌ NO RESULTS\n\n*No results found for your query*'
                }, { quoted: msg });
                break;
            }

            data = result.videos[0];
        }

        if (!data) throw new Error('No results');

        const videoId = data.videoId;
        const desc = `☘️ *𝗦𝗢𝗡𝗚* : _${data.title || 'N/A'}_     
╭─────────────────┄┄
🐾⏱️ *𝗗ᴜʀᴀᴛɪᴏɴ ➟* _${data.timestamp || 'N/A'}_
🐾👀 *𝗩ɪᴇᴡꜱ ➟* _${data.views?.toLocaleString() || 'N/A'}_
🐾📅 *𝗣ᴜʙʟɪꜱʜᴇᴅ ➟* _${data.ago || 'N/A'}_
🐾🌸 *𝗖ʜᴀɴɴᴇʟ ➟* _${data.author?.name || 'N/A'}_
╰──────────────────┉┉
*⬇️ 𝗗𝗢𝗪𝗡𝗟𝗢𝗔𝗗 𝗢𝗣𝗧𝗜𝗢𝗡𝗦*

*🔢 𝗥ᴇᴘʟʏ ᴡɪᴛʜ ᴀ 𝗡ᴜᴍʙᴇʀ 👇*

*01 🎧 ❯❯ ᴀᴜᴅɪᴏ (ᴍᴘ3)*
*02 📁 ❯❯ ᴅᴏᴄᴜᴍᴇɴᴛ (ғɪʟᴇ)*
*03 🎤 ❯❯ ᴠᴏɪᴄᴇ (ᴘᴛᴛ)*
`;

        const sentMsg = await socket.sendMessage(sender, {
            image: { url: data.thumbnail },
            caption: desc
        }, { quoted: msg });

        const listener = async (update) => {
            const mek = update.messages[0];
            if (!mek?.message) return;

            const ctx = mek.message.extendedTextMessage?.contextInfo;
            if (!ctx || ctx.stanzaId !== sentMsg.key.id) return;

            const text =
                mek.message.conversation ||
                mek.message.extendedTextMessage?.text;

            if (!['1', '2', '3'].includes(text)) return;
            socket.ev.off('messages.upsert', listener);

            await socket.sendMessage(sender, { react: { text: '⬇️', key: mek.key } });

            try {
                const apiUrl = `${config.API_YTMP3_URL}/api/ytmp3?url=https://youtu.be/${videoId}`;
                const res = await axios.get(apiUrl, { timeout: 20000 });

                if (res.data.status !== 'success') {
                    throw new Error(res.data.message || 'API Error');
                }

                const downloadLink = res.data.data.download_url;
                const songTitle = res.data.data.title || data.title;
                const thumbnail = res.data.data.thumbnail || data.thumbnail;

                let thumbBuffer = null;
                if (text === '2') {
                    try {
                        const thumb = await axios.get(thumbnail, { responseType: 'arraybuffer' });
                        thumbBuffer = await sharp(thumb.data)
                            .resize(300, 300, {
                                fit: 'contain',
                                background: { r: 0, g: 0, b: 0, alpha: 1 }
                            })
                            .jpeg()
                            .toBuffer();
                    } catch {}
                }

                await socket.sendMessage(sender, { react: { text: '⬆️', key: mek.key } });

                const fileName = songTitle.replace(/[^a-zA-Z0-9]/g, '_');
                if (text === '1') {
                    await socket.sendMessage(sender, {
                        audio: { url: downloadLink },
                        mimetype: 'audio/mpeg'
                    }, { quoted: mek });
                } else if (text === '2') {
                    await socket.sendMessage(sender, {
                        document: { url: downloadLink },
                        mimetype: 'audio/mpeg',
                        fileName: `${fileName}.mp3`,
                        jpegThumbnail: thumbBuffer,
                        caption: songTitle
                    }, { quoted: mek });

                } else if (text === '3') {
                    await socket.sendMessage(sender, { react: { text: '🔄', key: mek.key } });

                    try {
                        const tmpDir = os.tmpdir();
                        const inputPath = path.join(tmpDir, `${Date.now()}.mp3`);
                        const outputPath = path.join(tmpDir, `${Date.now()}.ogg`);
                        const audioRes = await axios.get(downloadLink, {
                            responseType: 'arraybuffer',
                            timeout: 30000
                        });
                        fs.writeFileSync(inputPath, audioRes.data);
                        await new Promise((resolve, reject) => {
                            ffmpeg(inputPath)
                                .audioCodec('libopus')
                                .format('ogg')
                                .audioChannels(1)
                                .audioFrequency(16000)
                                .audioBitrate('32k')
                                .outputOptions(['-vbr on','-compression_level 10'])
                                .save(outputPath)
                                .on('end', resolve)
                                .on('error', reject);
                        });
                        await socket.sendMessage(sender, {
                            audio: fs.readFileSync(outputPath),
                            mimetype: 'audio/ogg; codecs=opus',
                            ptt: true
                        }, { quoted: mek });

                        fs.unlinkSync(inputPath);
                        fs.unlinkSync(outputPath);

                        await socket.sendMessage(sender, { react: { text: '✅', key: mek.key } });

                    } catch (convErr) {
                        console.error('🎤 PTT Conversion Error:', convErr);
                        await socket.sendMessage(sender, {
                            audio: { url: downloadLink },
                            mimetype: 'audio/mpeg',
                            ptt: true
                        }, { quoted: mek });

                        await socket.sendMessage(sender, { react: { text: '⚠️', key: mek.key } });
                    }
                }

                await socket.sendMessage(sender, { react: { text: '✅', key: mek.key } });

            } catch (err) {
                await socket.sendMessage(sender, {
                    text: '❌ DOWNLOAD ERROR\n\n' + err.message
                }, { quoted: mek });

                await socket.sendMessage(sender, { react: { text: '❌', key: mek.key } });
            }
        };

        socket.ev.on('messages.upsert', listener);
        setTimeout(() => {
            socket.ev.off('messages.upsert', listener);
        }, 300000);

    } catch (err) {
        await socket.sendMessage(sender, {
            text: '❌ ERROR\n\n' + err.message
        }, { quoted: msg });
    }

    break
case 'system': {
  try {
    // 1. Add Reaction Immediately
    await socket.sendMessage(sender, { react: { text: "🍷", key: msg.key } });

    const sanitized = (number || '').replace(/[^0-9]/g, '');
    const cfg = await loadUserConfigFromMongo(sanitized) || {};
    const botName = cfg.botName || BOT_NAME_FANCY;
    const logo = cfg.logo || config.KEZU_IMG;

    // Meta Contact Card Style
    const metaQuote = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SYSTEM" },
      message: { contactMessage: { displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` } }
    };

    const os = require('os');
    
    // Calculate Uptime (Optional - adds more info)
    const uptime = os.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    // 2. Fancy Text Layout
    const text = `
╭━━━━━━━━━━━━━━━━━━━●
┃ 🖥️ *𝚂𝚈𝚂𝚃𝙴𝙼 𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝚃𝙸𝙾𝙽*
┃
┃ 🚀 *ᴏꜱ:* ${os.type()} ${os.release()}
┃ 🥉 *ᴘʟᴀᴛꜰᴏʀᴍ:* ${os.platform()}
┃ 🧠 *ᴄᴘᴜ ᴄᴏʀᴇꜱ:* ${os.cpus().length}
┃ 💾 *ʀᴀᴍ:* ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB
┃ ⏱️ *ᴜᴘᴛɪᴍᴇ:* ${hours}h ${minutes}m
╰━━━━━━━━━━━━━━━━━━━●
> 👨‍💻 *${botName} ʙᴏᴛ ꜱʏꜱᴛᴇᴍ*
`;

    let imagePayload = String(logo).startsWith('http') ? { url: logo } : fs.readFileSync(logo);

    await socket.sendMessage(sender, {
      image: imagePayload,
      caption: text,
      footer: `*${botName} 𝐒ʏꜱᴛᴇᴍ 𝐈ɴꜰᴏ*`,
      // Added a contextInfo for better appearance if supported
      contextInfo: {
        externalAdReply: {
          title: `${botName} System Status`,
          body: "Running Smoothly",
          thumbnail: imagePayload.url ? null : imagePayload, // Handle buffer vs url
          mediaType: 1,
          renderLargerThumbnail: true
        }
      },
    }, { quoted: metaQuote });

  } catch(e) {
    console.error('system error', e);
    await socket.sendMessage(sender, { text: '❌ Failed to get system info.' }, { quoted: msg });
  }
  break;
}

// ==================== DOWNLOAD MENU ====================
// ==================== CREATIVE / TOOL MENU ====================
// ==================== OTHER / SYSTEM MENU ====================
//-------------------- UNIFIED PROFILE PICTURE COMMAND --------------------//
case 'owner': {
  try {
    await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } });

    const ownerNumber = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
    const ownerName = config.OWNER_NAME;
    const ownerJid = `${ownerNumber}@s.whatsapp.net`;
    const ownerImageUrl = 'https://files.catbox.moe/begcjv.png';
    const websiteUrl = 'https://statusassistant-11969787fc03.herokuapp.com/#pair';

    const timeNow = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Colombo'
    });

    // Download image as buffer so it sends as real media (not URL preview)
    let imgBuffer = null;
    try {
      const _res = await axios.get(ownerImageUrl, { responseType: 'arraybuffer', timeout: 8000 });
      imgBuffer = Buffer.from(_res.data);
    } catch(e) { imgBuffer = null; }

    // Business-style card caption with @mention tag + price
    const caption =
`🏷️ *𝐊𝐄𝐙𝐔 𝐁𝐎𝐓 — 𝐒𝐄𝐑𝐕𝐈𝐂𝐄 𝐂𝐀𝐑𝐃* 👑

┌──────────────────────
│ 👤 *Owner :* @${ownerNumber}
│ 📍 *Location :* Sri Lanka 🇱🇰
│ ⏰ *Time :* ${timeNow}
└──────────────────────

📦 *𝐒𝐄𝐑𝐕𝐈𝐂𝐄𝐒 𝐈𝐍𝐂𝐋𝐔𝐃𝐄𝐃*
✅ Auto Status View & React
✅ Media Download (YT/TikTok/FB)
✅ AI Integration (Gemini)
✅ Group Management
✅ 24/7 Support

💬 *Chat :* https://wa.me/${ownerNumber}
🌐 *Web :* ${websiteUrl}

> 💡 _Tag @${ownerNumber} for instant reply_`;

    if (imgBuffer) {
      await socket.sendMessage(sender, {
        image: imgBuffer,
        caption,
        mentions: [ownerJid],
        mimetype: 'image/jpeg'
      }, { quoted: msg });
    } else {
      await socket.sendMessage(sender, {
        image: { url: ownerImageUrl },
        caption,
        mentions: [ownerJid]
      }, { quoted: msg });
    }

    await new Promise(r => setTimeout(r, 800));

    const vcard = `BEGIN:VCARD
VERSION:3.0
FN:${ownerName}
ORG:© KEZU BOT
TEL;TYPE=CELL,VOICE;waid=${ownerNumber}:+${ownerNumber}
TEL;TYPE=CELL,VOICE;waid=94705851067:+94705851067
END:VCARD`;
    await socket.sendMessage(sender, {
      contacts: { displayName: ownerName, contacts: [{ vcard }] }
    });

  } catch (err) {
    console.error('❌ Owner Command Error:', err);
    await socket.sendMessage(sender, {
      text: `⚠️ *Error:* Failed to load owner card.\nContact: +${config.OWNER_NUMBER}`
    }, { quoted: msg });
  }
  break;
}
//💐💐💐💐💐💐





        case 'unfollow': {
  const jid = args[0] ? args[0].trim() : null;
  if (!jid) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🤖 Status Assistant';

    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    return await socket.sendMessage(sender, { text: '❗ Provide channel JID to unfollow. Example:\n.unfollow 120363396379901844@newsletter' }, { quoted: shonux });
  }

  const admins = await loadAdminsFromMongo();
  const normalizedAdmins = admins.map(a => (a || '').toString());
  const senderIdSimple = (nowsender || '').includes('@') ? nowsender.split('@')[0] : (nowsender || '');
  const isAdmin = normalizedAdmins.includes(nowsender) || normalizedAdmins.includes(senderNumber) || normalizedAdmins.includes(senderIdSimple);
  if (!(isBotOrOwner || isAdmin)) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🤖 Status Assistant ';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW2" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only owner or admins can remove channels.' }, { quoted: shonux });
  }

  if (!jid.endsWith('@newsletter')) {
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🤖 Status Assistant';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW3" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Invalid JID. Must end with @newsletter' }, { quoted: shonux });
  }

  try {
    if (typeof socket.newsletterUnfollow === 'function') {
      await socket.newsletterUnfollow(jid);
    }
    await removeNewsletterFromMongo(jid);

    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🤖 Status Assistant';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW4" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Unfollowed and removed from DB: ${jid}` }, { quoted: shonux });
  } catch (e) {
    console.error('unfollow error', e);
    let userCfg = {};
    try { if (number && typeof loadUserConfigFromMongo === 'function') userCfg = await loadUserConfigFromMongo((number || '').replace(/[^0-9]/g, '')) || {}; } catch(e){ userCfg = {}; }
    const title = userCfg.botName || '🤖 Status Assistant';
    const shonux = {
        key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_UNFOLLOW5" },
        message: { contactMessage: { displayName: title, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${title};;;;\nFN:${title}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to unfollow: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}
case 'tiktok':
case 'ttdl':
case 'tt':
case 'tiktokdl': {
    try {
        const axios = require("axios");

        // 1. URL ලබා ගැනීම සහ Validation
        let text = (args.join(' ') || '').trim();
        
        if (!text || !text.startsWith('https://')) {
            return await socket.sendMessage(sender, {
                text: "❌ *Please provide a valid TikTok Link!*"
            }, { quoted: msg });
        }

        // 2. Bot Name Config
        const sanitized = (sender.split('@')[0] || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        // 3. Reaction
        await socket.sendMessage(sender, { react: { text: '✨', key: msg.key } });

        // 4. API Request
        const apiRes = await axios.get("https://www.movanest.xyz/v2/tiktok", {
            params: { url: text }
        });

        if (!apiRes.data.status || !apiRes.data.results) {
            return await socket.sendMessage(sender, { text: "❌ *TikTok Video Not Found!*" }, { quoted: msg });
        }

        const result = apiRes.data.results;
        
        // 5. ලස්සන Fancy Caption එක
        const captionMessage = `
╭───「 📍 *${botName}* 」───◆
│
│ 👤 *Author:* ${result.author_nickname || "Unknown"}
│ 📝 *Desc:* ${result.desc || "No Description"}
│ 👁️ *Views:* ${result.play_count || "N/A"}
│ 🔄 *Shares:* ${result.share_count || "N/A"}
│
╰───────────────────────◆

👇 *ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴅᴏᴡɴʟᴏᴀᴅ ᴛʏᴘᴇ* 👇`;

        // 6. Numbered Options
        const ttNumberedCaption = captionMessage + `

*1.* 🎬 NO WATERMARK
*2.* 💧 WITH WATERMARK
*3.* 🎵 AUDIO FILE
*4.* 📹 VIDEO NOTE

> *↩️ Reply with a number (1-4) to download*`;

        // 7. Send Numbered Message
        const sentMessage = await socket.sendMessage(sender, {
            image: { url: result.cover || result.thumbnail || "https://files.catbox.moe/g6ywiw.jpeg" },
            caption: ttNumberedCaption,
            footer: `© ᴘᴏᴡᴇʀᴇᴅ ʙʏ ${botName}`,
            contextInfo: {
                externalAdReply: {
                    title: "🎵 ＴＩＫＴＯＫ  ＤＯＷＮＬＯＡＤＥＲ",
                    body: "ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ ᴍᴇᴅɪᴀ...",
                    thumbnailUrl: result.cover || result.thumbnail,
                    sourceUrl: text,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: msg });
        const messageID = sentMessage.key.id;

        // 8. User Number Reply හැසිරවීම
        const handleTikTokSelection = async ({ messages: replyMessages }) => {
            const replyMek = replyMessages[0];
            if (!replyMek?.message) return;

            const selectedId = replyMek.message.conversation || 
                               replyMek.message.extendedTextMessage?.text;

            const isReplyToSentMsg = replyMek.message.extendedTextMessage?.contextInfo?.stanzaId === messageID;

            if ((isReplyToSentMsg || !isReplyToSentMsg) && sender === replyMek.key.remoteJid && ['1','2','3','4','tt_nw','tt_wm','tt_audio','tt_ptv'].includes((selectedId||'').trim())) {
                
                await socket.sendMessage(sender, { react: { text: '⬇️', key: replyMek.key } });

                let mediaBuffer;
                let mimeType = 'video/mp4';
                let isPtv = false;
                let finalCaption = '';
                let downloadUrl = '';

                try {
                    switch (selectedId) {
                        case 'tt_nw':
                        case '1':
                            downloadUrl = result.no_watermark;
                            finalCaption = `╭──「 *NO WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_wm':
                        case '2':
                            downloadUrl = result.watermark;
                            finalCaption = `╭──「 *WITH WATERMARK* 」──◆\n│ ✅ Downloaded Successfully!\n╰─────────────────◆`;
                            break;
                        case 'tt_audio':
                        case '3':
                            downloadUrl = result.music;
                            mimeType = 'audio/mpeg';
                            break;
                        case 'tt_ptv':
                        case '4':
                            downloadUrl = result.no_watermark;
                            isPtv = true;
                            break;
                        default:
                            return; // Invalid input, do nothing
                    }

                    if (!downloadUrl) throw new Error("URL Missing");

                    // Download Buffer
                    const bufferRes = await axios.get(downloadUrl, {
                        responseType: 'arraybuffer',
                        headers: { "User-Agent": "Mozilla/5.0" }
                    });
                    mediaBuffer = Buffer.from(bufferRes.data);

                    if (mediaBuffer.length > 100 * 1024 * 1024) {
                         return await socket.sendMessage(sender, { text: '❌ File too large (>100MB)!' }, { quoted: replyMek });
                    }

                    // Send Final Media
                    let msgContent = {};
                    if (mimeType === 'audio/mpeg') {
                        msgContent = { audio: mediaBuffer, mimetype: mimeType, ptt: false }; // Audio
                    } else if (isPtv) {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, ptv: true }; // Video Note
                    } else {
                        msgContent = { video: mediaBuffer, mimetype: mimeType, caption: finalCaption }; // Normal Video
                    }

                    await socket.sendMessage(sender, msgContent, { quoted: replyMek });
                    await socket.sendMessage(sender, { react: { text: '✅', key: replyMek.key } });

                } catch (err) {
                    console.log(err);
                    await socket.sendMessage(sender, { text: '❌ Download Failed!' }, { quoted: replyMek });
                }

                socket.ev.removeListener('messages.upsert', handleTikTokSelection);
            }
        };

        socket.ev.on('messages.upsert', handleTikTokSelection);

    } catch (err) {
        console.error(err);
        await socket.sendMessage(sender, { text: '*❌ System Error.*' }, { quoted: msg });
    }
    break;
}
case 'mediafire':
case 'mf':
case 'mfdl': {
    try {
        const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        const url = text.split(" ")[1]; // .mediafire <link>

        // ✅ Load bot name dynamically
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        // ✅ Fake Meta contact message (like Facebook style)
        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        if (!url) {
            return await socket.sendMessage(sender, {
                text: '🚫 *Please send a MediaFire link.*\n\nExample: .mediafire <url>'
            }, { quoted: shonux });
        }

        // ⏳ Notify start
        await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
        await socket.sendMessage(sender, { text: '*⏳ Fetching MediaFire file info...*' }, { quoted: shonux });

        // 🔹 Call API
        let api = `https://tharuzz-ofc-apis.vercel.app/api/download/mediafire?url=${encodeURIComponent(url)}`;
        let { data } = await axios.get(api);

        if (!data.success || !data.result) {
            return await socket.sendMessage(sender, { text: '❌ *Failed to fetch MediaFire file.*' }, { quoted: shonux });
        }

        const result = data.result;
        const title = result.title || result.filename;
        const filename = result.filename;
        const fileSize = result.size;
        const downloadUrl = result.url;

        const caption = `📦 *${title}*\n\n` +
                        `📁 *𝐅ilename:* ${filename}\n` +
                        `📏 *𝐒ize:* ${fileSize}\n` +
                        `🌐 *𝐅rom:* ${result.from}\n` +
                        `📅 *𝐃ate:* ${result.date}\n` +
                        `🕑 *𝐓ime:* ${result.time}\n\n` +
                        `*✅ 𝐃ownloaded 𝐁y ${botName}*`;

        // 🔹 Send file automatically (document type for .zip etc.)
        await socket.sendMessage(sender, {
            document: { url: downloadUrl },
            fileName: filename,
            mimetype: 'application/octet-stream',
            caption: caption
        }, { quoted: shonux });

    } catch (err) {
        console.error("Error in MediaFire downloader:", err);

        // ✅ In catch also send Meta mention style
        const sanitized = (number || '').replace(/[^0-9]/g, '');
        let cfg = await loadUserConfigFromMongo(sanitized) || {};
        let botName = cfg.botName || '🤖 Status Assistant';

        const shonux = {
            key: {
                remoteJid: "status@broadcast",
                participant: "0@s.whatsapp.net",
                fromMe: false,
                id: "META_AI_FAKE_ID_MEDIAFIRE"
            },
            message: {
                contactMessage: {
                    displayName: botName,
                    vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD`
                }
            }
        };

        await socket.sendMessage(sender, { text: '*❌ Internal Error. Please try again later.*' }, { quoted: shonux });
    }
    break;
}
// ---------------- list saved newsletters (show emojis) ----------------
case 'ig':
case 'insta':
case 'instagram': {
  try {
    const text = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
    const q = text.split(" ").slice(1).join(" ").trim();

    // Validate
    if (!q) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Please provide an Instagram post/reel link.*',
      });
      return;
    }

    const igRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/[^\s]+/;
    if (!igRegex.test(q)) {
      await socket.sendMessage(sender, { 
        text: '*🚫 Invalid Instagram link.*',
      });
      return;
    }

    await socket.sendMessage(sender, { react: { text: '🎥', key: msg.key } });
    await socket.sendMessage(sender, { text: '*⏳ Downloading Instagram media...*' });

    // 🔹 Load session bot name
    const sanitized = (number || '').replace(/[^0-9]/g, '');
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    let botName = cfg.botName || '🤖 Status Assistant';

    // 🔹 Meta style fake contact
    const shonux = {
      key: {
        remoteJid: "status@broadcast",
        participant: "0@s.whatsapp.net",
        fromMe: false,
        id: "META_AI_FAKE_ID_002"
      },
      message: {
        contactMessage: {
          displayName: botName, // dynamic bot name
          vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550003:+1 313 555 0003
END:VCARD`
        }
      }
    };

    // API request
    let apiUrl = `https://delirius-apiofc.vercel.app/download/instagram?url=${encodeURIComponent(q)}`;
    let { data } = await axios.get(apiUrl).catch(() => ({ data: null }));

    // Backup API if first fails
    if (!data?.status || !data?.downloadUrl) {
      const backupUrl = `https://api.tiklydown.me/api/instagram?url=${encodeURIComponent(q)}`;
      const backup = await axios.get(backupUrl).catch(() => ({ data: null }));
      if (backup?.data?.video) {
        data = {
          status: true,
          downloadUrl: backup.data.video
        };
      }
    }

    if (!data?.status || !data?.downloadUrl) {
      await socket.sendMessage(sender, { 
        text: '*🚩 Failed to fetch Instagram video.*',
      });
      return;
    }

    // Caption (Dynamic Bot Name)
    const titleText = `*📸 ${botName} 𝐈ɴꜱᴛᴀɢʀᴀᴍ 𝐃ᴏᴡɴʟᴏᴀᴅᴇʀ*`;
    const content = `┏━━━━━━━━━━━━━━━━\n` +
                    `┃📌 \`𝐒ource\` : Instagram\n` +
                    `┃📹 \`𝐓ype\` : Video/Reel\n` +
                    `┗━━━━━━━━━━━━━━━━`;

    const footer = `🤖 ${botName}`;
    const captionMessage = typeof formatMessage === 'function'
      ? formatMessage(titleText, content, footer)
      : `${titleText}\n\n${content}\n${footer}`;

    // Send video with fake contact quoted
    await socket.sendMessage(sender, {
      video: { url: data.downloadUrl },
      caption: captionMessage,
      contextInfo: { mentionedJid: [sender] },
    }, { quoted: shonux });

  } catch (err) {
    console.error("Error in Instagram downloader:", err);
    await socket.sendMessage(sender, { 
      text: '*❌ Internal Error. Please try again later.*',
    });
  }
  break;
}
//====================================================================
        case 'siyatha': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIYATHA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/siyatha?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Siyatha News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗦ɪʏᴀᴛʜᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 ??ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('siyatha error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Siyatha News.' }, { quoted: botMention });
          }
          break;
        }

        case 'bbc': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_BBC" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/bbc?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch BBC News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗕ʙᴄ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('bbc error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching BBC News.' }, { quoted: botMention });
          }
          break;
        }

        case 'lnw': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LNW" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/lnw?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch LNW News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗟ɴᴡ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lnw error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching LNW News.' }, { quoted: botMention });
          }
          break;
        }

        case 'dasathalanka': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_DASA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/dasathalanka?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Dasa Thalanka News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗗ᴀꜱᴀᴛʜᴀʟᴀɴᴋᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('dasathalanka error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Dasa Thalanka News.' }, { quoted: botMention });
          }
          break;
        }

        case 'itn': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ITN" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/itn?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch ITN News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗜ᴛɴ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('itnnews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching ITN News.' }, { quoted: botMention });
          }
          break;
        }

        case 'hiru': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_HIRU" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://api.srihub.store/news/hiru?apikey=dew_nPUIx9HHozkgxSpy3H9FgUQ1OVylTVgdoUJC44Gl');
            if (!res.data?.success || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Hiru News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗛ɪʀᴜ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('hirunews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Hiru News.' }, { quoted: botMention });
          }
          break;
        }

        case 'ada': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_ADA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/ada');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Ada News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗔ᴅᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('adanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Ada News.' }, { quoted: botMention });
          }
          break;
        }

        case 'sirasa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_SIRASA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/sirasa');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Sirasa News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗦ɪʀᴀꜱᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('sirasanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Sirasa News.' }, { quoted: botMention });
          }
          break;
        }

        case 'lankadeepa': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_LANKADEEPA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/lankadeepa');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Lankadeepa News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗟ᴀɴᴋᴀᴅᴇᴇᴘᴀ 𝗡ᴇᴡꜱ : ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('lankadeepanews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Lankadeepa News.' }, { quoted: botMention });
          }
          break;
        }

        case 'gagana': {
          try {
            const sanitized = (number || '').replace(/[^0-9]/g, '');
            const userCfg = await loadUserConfigFromMongo(sanitized) || {};
            const botName = userCfg.botName || BOT_NAME_FANCY;

            const botMention = {
              key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_FAKE_ID_GAGANA" },
              message: {
                contactMessage: {
                  displayName: botName, vcard: `BEGIN:VCARD
VERSION:3.0
N:${botName};;;;
FN:${botName}
ORG:Meta Platforms
TEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002
END:VCARD` }
              }
            };

            const res = await axios.get('https://saviya-kolla-api.koyeb.app/news/gagana');
            if (!res.data?.status || !res.data.result) return await socket.sendMessage(sender, { text: '❌ Failed to fetch Gagana News.' }, { quoted: botMention });

            const n = res.data.result;
            const caption = `📰 *𝗚ᴀɢᴀɴᴀ 𝗡ᴇᴡꜱ ${n.title}*\n\n*📅 𝗗ᴀᴛᴇ :* ${n.date}\n*⏰ 𝗧ɪᴍᴇ :* ${n.time}\n\n${n.desc}\n\n*🔗 𝗥ᴇᴀᴅ 𝗠ᴏʀᴇ :* (${n.url})\n\n> *${botName}*`;

            await socket.sendMessage(sender, { image: { url: n.image }, caption, contextInfo: { mentionedJid: [sender] } }, { quoted: botMention });

          } catch (err) {
            console.error('gagananews error:', err);
            await socket.sendMessage(sender, { text: '❌ Error fetching Gagana News.' }, { quoted: botMention });
          }
          break;
        }

// use inside your switch(command) { ... } block

case 'setbotname': {
  const sanitized = (number || '').replace(/[^0-9]/g, '');
  const senderNum = (nowsender || '').split('@')[0];
  const ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
  if (senderNum !== sanitized && !isOwner(senderNum)) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME1" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change this session bot name.' }, { quoted: shonux });
    break;
  }

  const name = args.join(' ').trim();
  if (!name) {
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME2" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    return await socket.sendMessage(sender, { text: '❗ Provide bot name. Example: `.setbotname 🤖 Status Assistant`' }, { quoted: shonux });
  }

  try {
    let cfg = await loadUserConfigFromMongo(sanitized) || {};
    cfg.botName = name;
    await setUserConfigInMongo(sanitized, cfg);

    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME3" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };

    await socket.sendMessage(sender, { text: `✅ Bot display name set for this session: ${name}` }, { quoted: shonux });
  } catch (e) {
    console.error('setbotname error', e);
    const shonux = {
      key: { remoteJid: "status@broadcast", participant: "0@s.whatsapp.net", fromMe: false, id: "META_AI_SETBOTNAME4" },
      message: { contactMessage: { displayName: BOT_NAME_FANCY, vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${BOT_NAME_FANCY};;;;\nFN:${BOT_NAME_FANCY}\nORG:Meta Platforms\nTEL;type=CELL;type=VOICE;waid=13135550002:+1 313 555 0002\nEND:VCARD` } }
    };
    await socket.sendMessage(sender, { text: `❌ Failed to set bot name: ${e.message || e}` }, { quoted: shonux });
  }
  break;
}

case 'setmenuvideo': {
  const _smvSan = (number || '').replace(/[^0-9]/g, '');
  const _smvSenderNum = (nowsender || '').split('@')[0];
  const _smvOwnerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
  if (_smvSenderNum !== _smvSan && _smvSenderNum !== _smvOwnerNum) {
    return await socket.sendMessage(sender, { text: '❌ Permission denied. Only the session owner or bot owner can change the menu video.' }, { quoted: msg });
  }

  const _smvUrl = (args[0] || '').trim();
  if (!_smvUrl || !_smvUrl.startsWith('http')) {
    let _smvCfg = await loadUserConfigFromMongo(_smvSan) || {};
    const _smvCurrent = _smvCfg.menuVideo || 'https://files.catbox.moe/ffjmpr.mp4';
    return await socket.sendMessage(sender, {
      text: `📖 *Set Menu Video Usage:*\n*.setmenuvideo <url>*\n\nExample:\n_.setmenuvideo https://files.catbox.moe/xxxxx.mp4_\n\n🎬 *Current menu video:* ${_smvCurrent}\n\n_This changes the video note shown when .menu is used._`
    }, { quoted: msg });
  }

  try {
    let _smvCfg = await loadUserConfigFromMongo(_smvSan) || {};
    _smvCfg.menuVideo = _smvUrl;
    await setUserConfigInMongo(_smvSan, _smvCfg);
    await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });
    await socket.sendMessage(sender, { text: `✅ *Menu video updated!*\n\n🎬 *New URL:* ${_smvUrl}\n\nThis will be shown when users use *.menu*` }, { quoted: msg });
  } catch (e) {
    console.error('setmenuvideo error', e);
    await socket.sendMessage(sender, { text: `❌ Failed to set menu video: ${e.message || e}` }, { quoted: msg });
  }
  break;
}

        case 'setlogo': {
          await socket.sendMessage(sender, { react: { text: '🖼️', key: msg.key } });
          try {
            const _slSan = (number || '').replace(/[^0-9]/g, '');
            const _slSenderNum = (nowsender || '').split('@')[0];
            const _slOwnerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            let _slCfg = await loadUserConfigFromMongo(_slSan) || {};
            const _slStoredOwner = (_slCfg.sessionOwner || '').replace(/[^0-9]/g, '');
            const _slAllowed = _slSenderNum === _slSan || _slSenderNum === _slOwnerNum || (_slStoredOwner && _slSenderNum === _slStoredOwner);
            if (!_slAllowed) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can change the bot logo.' }, { quoted: msg });
            }

            // Check if a URL was provided as arg
            const _slArgUrl = (args[0] || '').trim();
            const _slUrlRegex = /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i;

            if (_slArgUrl && _slUrlRegex.test(_slArgUrl)) {
              // Direct URL provided
              _slCfg.logo = _slArgUrl;
              await setUserConfigInMongo(_slSan, _slCfg);
              await socket.sendMessage(sender, {
                image: { url: _slArgUrl },
                caption: `✅ *Bot logo updated!*\n🔗 *URL:* ${_slArgUrl}`
              }, { quoted: msg });

            } else {
              // Check if replying to an image
              const _slCtx = msg.message?.extendedTextMessage?.contextInfo;
              const _slQuoted = _slCtx?.quotedMessage;
              const _slQImg = _slQuoted?.imageMessage;

              if (!_slQImg) {
                return await socket.sendMessage(sender, {
                  text: `📖 *Set Logo Usage:*\n1️⃣ Reply to an image with *.setlogo*\n2️⃣ Or provide an image URL:\n   _.setlogo https://example.com/image.jpg_`
                }, { quoted: msg });
              }

              // Download quoted image and upload to catbox
              try {
                const _slStream = await downloadContentFromMessage(_slQImg, 'image');
                let _slBuf = Buffer.from([]);
                for await (const c of _slStream) _slBuf = Buffer.concat([_slBuf, c]);

                const axios = require('axios');
                const FormData = require('form-data');
                const form = new FormData();
                form.append('reqtype', 'fileupload');
                form.append('fileToUpload', _slBuf, { filename: 'logo.jpg', contentType: _slQImg.mimetype || 'image/jpeg' });

                const _slUp = await axios.post('https://catbox.moe/user/api.php', form, {
                  headers: { ...form.getHeaders() },
                  timeout: 30000
                });

                const _slUrl = (_slUp.data || '').trim();
                if (!_slUrl || !_slUrl.startsWith('http')) throw new Error('Upload failed');

                _slCfg.logo = _slUrl;
                await setUserConfigInMongo(_slSan, _slCfg);
                await socket.sendMessage(sender, {
                  image: { url: _slUrl },
                  caption: `✅ *Bot logo updated!*\n🔗 *Stored URL:* ${_slUrl}`
                }, { quoted: msg });

              } catch(_slUpErr) {
                console.error('setlogo upload error:', _slUpErr);
                await socket.sendMessage(sender, { text: `❌ Failed to upload image: ${_slUpErr.message || _slUpErr}` }, { quoted: msg });
              }
            }
          } catch(e) {
            console.error('setlogo cmd error:', e);
            await socket.sendMessage(sender, { text: `❌ setlogo failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'setowner': {
          await socket.sendMessage(sender, { react: { text: '👑', key: msg.key } });
          try {
            const _soSan = (number || '').replace(/[^0-9]/g, '');
            const _soSenderNum = (nowsender || '').split('@')[0];
            const _soOwnerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');

            // Only session number itself or global bot owner can set session owner
            if (_soSenderNum !== _soSan && _soSenderNum !== _soOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session account holder or global bot owner can set the session owner.' }, { quoted: msg });
            }

            const _soRaw = (args[0] || '').trim();
            if (!_soRaw) {
              let _soShowCfg = await loadUserConfigFromMongo(_soSan) || {};
              const _soCurrent = _soShowCfg.sessionOwner || 'Not set (default: session number)';
              return await socket.sendMessage(sender, {
                text: `📖 *Set Owner Usage:*\n*.setowner number*\n\n*Example:*\n_.setowner 94789988778_\n\n👑 *Current session owner:* ${_soCurrent}\n\n_This sets a trusted number that can control this bot session's settings._`
              }, { quoted: msg });
            }

            const _soDigits = _soRaw.replace(/[^0-9]/g, '');
            if (!_soDigits || _soDigits.length < 7) {
              return await socket.sendMessage(sender, { text: '❗ Invalid number. Example: `.setowner 94789988778`' }, { quoted: msg });
            }

            let _soCfg = await loadUserConfigFromMongo(_soSan) || {};
            const _soPrev = _soCfg.sessionOwner || null;
            _soCfg.sessionOwner = _soDigits;
            await setUserConfigInMongo(_soSan, _soCfg);

            const _soJid = `${_soDigits}@s.whatsapp.net`;
            await socket.sendMessage(sender, {
              text: `✅ *Session Owner Updated!*\n\n👑 *New Owner:* @${_soDigits}\n📱 *Session:* +${_soSan}${_soPrev ? `\n🔄 *Previous:* ${_soPrev}` : ''}\n\n_This number now has owner-level access to bot settings for this session._`,
              mentions: [_soJid]
            }, { quoted: msg });

            // Notify the new owner
            try {
              await socket.sendMessage(_soJid, {
                text: `👑 *You have been set as the session owner for bot session +${_soSan}!*\n\nYou can now control this bot's settings using owner commands.`
              });
            } catch(e) {}

          } catch(e) {
            console.error('setowner cmd error:', e);
            await socket.sendMessage(sender, { text: `❌ setowner failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'report': {
          await socket.sendMessage(sender, { react: { text: '⚠️', key: msg.key } });
          try {
            const _rpSan = (number || '').replace(/[^0-9]/g, '');
            const _rpSenderNum = (nowsender || '').split('@')[0];
            const _rpOwnerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_rpSenderNum !== _rpSan && _rpSenderNum !== _rpOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }

            // parse "number,count"
            const _rpRaw = (args[0] || '').trim();
            if (!_rpRaw.includes(',')) {
              return await socket.sendMessage(sender, {
                text: `📖 *Report Command Usage:*\n*.report number,count*\n\n*Example:*\n_.report 94789988778,10_\n\nThis will send 10 reports to that number.\n⚠️ Max 20 reports per command.`
              }, { quoted: msg });
            }

            const _rpParts = _rpRaw.split(',');
            const _rpTargetRaw = (_rpParts[0] || '').trim();
            const _rpCount = parseInt((_rpParts[1] || '').trim(), 10);

            if (!_rpTargetRaw || isNaN(_rpCount) || _rpCount < 1) {
              return await socket.sendMessage(sender, { text: '❗ Invalid format. Example: `.report 94789988778,10`' }, { quoted: msg });
            }

            const _rpMax = 20;
            const _rpFinal = Math.min(_rpCount, _rpMax);
            const _rpDigits = _rpTargetRaw.replace(/[^0-9]/g, '');
            const _rpJid = `${_rpDigits}@s.whatsapp.net`;

            if (!_rpDigits) {
              return await socket.sendMessage(sender, { text: '❗ Invalid phone number.' }, { quoted: msg });
            }

            await socket.sendMessage(sender, {
              text: `📡 *Sending ${_rpFinal} report(s) to* +${_rpDigits}...\n⏳ Please wait...`
            }, { quoted: msg });

            let _rpSuccess = 0;
            for (let _rpi = 0; _rpi < _rpFinal; _rpi++) {
              try {
                if (typeof socket.query === 'function') {
                  await socket.query({
                    tag: 'iq',
                    attrs: {
                      to: 's.whatsapp.net',
                      type: 'set',
                      xmlns: 'spam',
                      id: socket.generateMessageTag ? socket.generateMessageTag() : `report-${Date.now()}-${_rpi}`
                    },
                    content: [{
                      tag: 'report',
                      attrs: { v: '2', type: '1' },
                      content: [{
                        tag: 'user',
                        attrs: { jid: _rpJid }
                      }]
                    }]
                  });
                } else if (typeof socket.sendNode === 'function') {
                  await socket.sendNode({
                    tag: 'iq',
                    attrs: {
                      to: 's.whatsapp.net',
                      type: 'set',
                      xmlns: 'spam',
                      id: `report-${Date.now()}-${_rpi}`
                    },
                    content: [{
                      tag: 'report',
                      attrs: { v: '2', type: '1' },
                      content: [{
                        tag: 'user',
                        attrs: { jid: _rpJid }
                      }]
                    }]
                  });
                } else {
                  await socket.updateBlockStatus(_rpJid, 'block');
                  await delay(300);
                  await socket.updateBlockStatus(_rpJid, 'unblock');
                }
                _rpSuccess++;
              } catch(_rpErr) {
                console.log(`Report attempt ${_rpi + 1} error:`, _rpErr.message || _rpErr);
              }
              await delay(800);
            }

            await socket.sendMessage(sender, {
              text: `✅ *Report Complete!*\n\n📋 *Target:* +${_rpDigits}\n📊 *Reports Sent:* ${_rpSuccess}/${_rpFinal}\n${_rpSuccess < _rpFinal ? `⚠️ ${_rpFinal - _rpSuccess} failed (rate limit or invalid number)` : '🎯 All reports sent successfully!'}`
            }, { quoted: msg });
            await socket.sendMessage(sender, { react: { text: '✅', key: msg.key } });

          } catch(e) {
            console.error('report cmd error:', e);
            try { await socket.sendMessage(sender, { react: { text: '❌', key: msg.key } }); } catch(re){}
            await socket.sendMessage(sender, { text: `❌ Report failed: ${e.message || e}` }, { quoted: msg });
          }
          break;
        }

        case 'antidelete': {
          await socket.sendMessage(sender, { react: { text: '🗑️', key: msg.key } });
          try {
            const _adSan = (number || '').replace(/[^0-9]/g, '');
            const _adSenderNum = (nowsender || '').split('@')[0];
            const _adOwnerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_adSenderNum !== _adSan && _adSenderNum !== _adOwnerNum) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const _adOpt = (args[0] || '').toLowerCase();
            if (_adOpt === 'on' || _adOpt === 'off') {
              let _adCfg = await loadUserConfigFromMongo(_adSan) || {};
              _adCfg.ANTI_DELETE = _adOpt;
              await setUserConfigInMongo(_adSan, _adCfg);
              await socket.sendMessage(sender, { text: `✅ *Anti Delete ${_adOpt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\nDeleted messages will ${_adOpt === 'on' ? 'now be forwarded to you.' : 'no longer be forwarded.'}` }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, { text: `📖 *Anti Delete Usage:*\n*.antidelete on* — Enable (resend deleted msgs to you)\n*.antidelete off* — Disable` }, { quoted: msg });
            }
          } catch(e) { console.error('antidelete cmd error:', e); await socket.sendMessage(sender, { text: '❌ Error updating antidelete.' }, { quoted: msg }); }
          break;
        }

        // ─── STATUS DOWNLOAD TOGGLE ─────────────────────────────────
        case 'statusdl':
        case 'stsdl':
        case 'statussave': {
          await socket.sendMessage(sender, { react: { text: '📥', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _senderNum = (nowsender || '').split('@')[0];
            const _ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_senderNum !== _san && !isOwner(_senderNum)) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_STATUS_SAVE = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, {
                text: `📥 *Auto Status Download ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'Status media will be auto-saved to your chat.' : 'Auto status saving stopped.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📥 *Auto Status Download*\n\n*.statusdl on* — Auto-save status images/videos to self\n*.statusdl off* — Disable`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating status download.' }, { quoted: msg }); }
          break;
        }

        // ─── VIDEO NOTE TOGGLE ──────────────────────────────────────
        case 'vidnote':
        case 'videonote':
        case 'videoonote': {
          await socket.sendMessage(sender, { react: { text: '📹', key: msg.key } });
          try {
            const _sanVN = (number || '').replace(/[^0-9]/g, '');
            const _senderNumVN = (nowsender || '').split('@')[0];
            const _ownerNumVN = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_senderNumVN !== _sanVN && _senderNumVN !== _ownerNumVN) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfgVN = await loadUserConfigFromMongo(_sanVN) || {};
              _cfgVN.VIDEO_NOTE = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_sanVN, _cfgVN);
              await socket.sendMessage(sender, {
                text: `📹 *Menu Video Note ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'Menu command ට video note (round video) send වෙනවා.' : 'Menu video note off කළා.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `📹 *Menu Video Note Toggle*\n\n*.vidnote on* — Menu video note enable කරන්න\n*.vidnote off* — Disable කරන්න\n\n> Default: *off*`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating video note setting.' }, { quoted: msg }); }
          break;
        }

        // ─── VIEW ONCE DOWNLOAD TOGGLE ───────────────────────────────
        case 'vvsave':
        case 'vvdl':
        case 'viewonce': {
          await socket.sendMessage(sender, { react: { text: '👁️', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _senderNum = (nowsender || '').split('@')[0];
            const _ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_senderNum !== _san && !isOwner(_senderNum)) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_VV_SAVE = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              await socket.sendMessage(sender, {
                text: `👁️ *Auto View Once Download ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? 'View-once messages will be auto-saved to your chat.' : 'Auto view-once saving stopped.'}`
              }, { quoted: msg });
            } else {
              await socket.sendMessage(sender, {
                text: `👁️ *Auto View Once Download*\n\n*.vvsave on* — Auto-save view-once images/videos/audio to self\n*.vvsave off* — Disable`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating view-once save.' }, { quoted: msg }); }
          break;
        }

        // ─── AUTO CONTACT SAVE TOGGLE ────────────────────────────────
        case 'autocsave':
        case 'autosavecontact':
        case 'contactsave': {
          await socket.sendMessage(sender, { react: { text: '📋', key: msg.key } });
          try {
            const _san = (number || '').replace(/[^0-9]/g, '');
            const _senderNum = (nowsender || '').split('@')[0];
            const _ownerNum = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
            if (_senderNum !== _san && !isOwner(_senderNum)) {
              return await socket.sendMessage(sender, { text: '❌ Only the session owner can use this command.' }, { quoted: msg });
            }
            const opt = (args[0] || '').toLowerCase();
            if (opt === 'on' || opt === 'off') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.AUTO_CONTACT_SAVE = opt === 'on' ? 'true' : 'false';
              await setUserConfigInMongo(_san, _cfg);
              const _prefix = _cfg.CONTACT_SAVE_PREFIX || 'Contact';
              const _count = _cfg.CONTACT_SAVE_COUNT || 0;
              await socket.sendMessage(sender, {
                text: `📋 *Auto Contact Save ${opt === 'on' ? 'ENABLED ✅' : 'DISABLED ❌'}*\n\n${opt === 'on' ? `Contacts will be saved as:\n*${_prefix}-01, ${_prefix}-02, ...*\n\nNext contact: *${_prefix}-${String(_count + 1).padStart(2, '0')}*\n\nTo change name prefix: *.autocsave name <prefix>*\nExample: *.autocsave name criminal*` : 'Auto contact saving stopped.'}`
              }, { quoted: msg });
            } else if (opt === 'name') {
              const newPrefix = args.slice(1).join(' ').trim();
              if (!newPrefix) {
                return await socket.sendMessage(sender, { text: `❗ *Usage:* *.autocsave name <prefix>*\n\nExample:\n_.autocsave name criminal_\n→ Contacts saved as: *criminal-01, criminal-02, ...*` }, { quoted: msg });
              }
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.CONTACT_SAVE_PREFIX = newPrefix;
              await setUserConfigInMongo(_san, _cfg);
              const _count = _cfg.CONTACT_SAVE_COUNT || 0;
              await socket.sendMessage(sender, {
                text: `✅ *Contact Save Prefix Updated!*\n\n🏷️ New prefix: *${newPrefix}*\nContacts will be saved as: *${newPrefix}-01, ${newPrefix}-02, ...*\n\nNext contact: *${newPrefix}-${String(_count + 1).padStart(2, '0')}*`
              }, { quoted: msg });
            } else if (opt === 'reset') {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              _cfg.CONTACT_SAVE_COUNT = 0;
              await setUserConfigInMongo(_san, _cfg);
              const _prefix = _cfg.CONTACT_SAVE_PREFIX || 'Contact';
              await socket.sendMessage(sender, {
                text: `✅ *Contact Counter Reset!*\n\n🔄 Counter restarted from 01\nNext contact: *${_prefix}-01*`
              }, { quoted: msg });
            } else {
              let _cfg = await loadUserConfigFromMongo(_san) || {};
              const _prefix = _cfg.CONTACT_SAVE_PREFIX || 'Contact';
              const _count = _cfg.CONTACT_SAVE_COUNT || 0;
              const _status = _cfg.AUTO_CONTACT_SAVE === 'true' ? 'ON ✅' : 'OFF ❌';
              await socket.sendMessage(sender, {
                text: `📋 *Auto Contact Save*\n\n*Status:* ${_status}\n*Name Prefix:* ${_prefix}\n*Next Number:* ${_prefix}-${String(_count + 1).padStart(2, '0')}\n\n*Commands:*\n*.autocsave on* — Enable auto saving\n*.autocsave off* — Disable\n*.autocsave name criminal* — Set name prefix\n*.autocsave reset* — Reset counter to 01`
              }, { quoted: msg });
            }
          } catch(e) { await socket.sendMessage(sender, { text: '❌ Error updating contact save.' }, { quoted: msg }); }
          break;
        }

        // default
        default:
          break;
      }
    } catch (err) {
      console.error('Command handler error:', err);
      try { await socket.sendMessage(sender, { image: { url: config.KEZU_IMG }, caption: formatMessage('❌ ERROR', 'An error occurred while processing your command. Please try again.', BOT_NAME_FANCY) }); } catch(e){}
    }

  });
}

// ---------------- Call Rejection Handler ----------------

// ---------------- Simple Call Rejection Handler ----------------

async function setupCallRejection(socket, sessionNumber) {
    socket.ev.on('call', async (calls) => {
        try {
            // Load user-specific config from MongoDB
            const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
            const userConfig = await loadUserConfigFromMongo(sanitized) || {};
            if (userConfig.ANTI_CALL !== 'on') return;

            console.log(`📞 Incoming call detected for ${sanitized} - Auto rejecting...`);

            for (const call of calls) {
                if (call.status !== 'offer') continue;

                const id = call.id;
                const from = call.from;

                // Reject the call
                await socket.rejectCall(id, from);
                
                // Send rejection message to caller
                await socket.sendMessage(from, {
                    text: '*🔕 Auto call rejection is enabled. Calls are automatically rejected.*'
                });
                
                console.log(`✅ Auto-rejected call from ${from}`);

                // Send notification to bot user
                const userJid = jidNormalizedUser(socket.user.id);
                const rejectionMessage = formatMessage(
                    '📞 CALL REJECTED',
                    `Auto call rejection is active.\n\nCall from: ${from}\nTime: ${getSriLankaTimestamp()}`,
                    BOT_NAME_FANCY
                );

                await socket.sendMessage(userJid, { 
                    image: { url: config.KEZU_IMG }, 
                    caption: rejectionMessage 
                });
            }
        } catch (err) {
            console.error(`Call rejection error for ${sessionNumber}:`, err);
        }
    });
}

// ---------------- Auto Status Download Handler ----------------

async function setupAutoStatusDownload(socket, sessionNumber) {
  // This piggybacks on setupStatusHandlers — logic is in that handler above
  // Kept as stub for future extension
}

// ---------------- Auto View Once Download Handler ----------------

async function setupViewOnceHandler(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message) return;
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid === 'status@broadcast') return;

    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      const autoVvSave = userConfig.AUTO_VV_SAVE || 'false';
      if (autoVvSave !== 'true') return;

      const msgType = getContentType(msg.message);
      let voMessage = null;

      if (msgType === 'viewOnceMessage') {
        voMessage = msg.message.viewOnceMessage?.message;
      } else if (msgType === 'viewOnceMessageV2') {
        voMessage = msg.message.viewOnceMessageV2?.message;
      } else if (msgType === 'viewOnceMessageV2Extension') {
        voMessage = msg.message.viewOnceMessageV2Extension?.message;
      }

      if (!voMessage) return;

      const innerType = getContentType(voMessage);
      if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(innerType)) return;

      const mediaMsg = voMessage[innerType];
      const mediaTypeStr = innerType.replace('Message', '');

      const stream = await downloadContentFromMessage(mediaMsg, mediaTypeStr);
      let buffer = Buffer.from([]);
      for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNum = senderJid.split('@')[0];
      const botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
      const caption = `👁️ *View Once Saved* 📥\n👤 *From:* +${senderNum}\n\n> _Auto-saved by 🤖 Status Assistant_`;

      if (innerType === 'imageMessage') {
        await socket.sendMessage(botJid, { image: buffer, caption });
      } else if (innerType === 'videoMessage') {
        await socket.sendMessage(botJid, { video: buffer, caption });
      } else if (innerType === 'audioMessage') {
        await socket.sendMessage(botJid, { audio: buffer, mimetype: mediaMsg.mimetype || 'audio/ogg; codecs=opus', ptt: mediaMsg.ptt || false });
      }
      console.log(`[VV SAVE] Saved view-once from ${senderNum}`);
    } catch (e) {
      console.error('[VV SAVE] Error:', e.message);
    }
  });
}

// ---------------- Auto Contact Save Handler ----------------

async function setupAutoContactSave(socket, sessionNumber) {
  const _savedContactsCache = new Set();

  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message) return;
    if (msg.key.fromMe) return;
    if (msg.key.remoteJid === 'status@broadcast') return;
    if (msg.key.remoteJid?.endsWith('@newsletter')) return;

    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userConfig = await loadUserConfigFromMongo(sanitized) || {};
      const autoContactSave = userConfig.AUTO_CONTACT_SAVE || 'false';
      if (autoContactSave !== 'true') return;

      const senderJid = msg.key.participant || msg.key.remoteJid;
      const senderNum = senderJid.split('@')[0];

      // Skip groups, self, already-saved this session
      if (!senderNum || _savedContactsCache.has(senderNum)) return;
      if (senderNum === sanitized) return;

      _savedContactsCache.add(senderNum);

      // Build contact name using custom prefix + auto-incremented counter
      const namePrefix = userConfig.CONTACT_SAVE_PREFIX || 'Contact';
      const currentCount = (userConfig.CONTACT_SAVE_COUNT || 0) + 1;
      const displayName = `${namePrefix}-${String(currentCount).padStart(2, '0')}`;

      // Persist incremented counter
      userConfig.CONTACT_SAVE_COUNT = currentCount;
      await setUserConfigInMongo(sanitized, userConfig);

      const botJid = socket.user.id.split(':')[0] + '@s.whatsapp.net';
      const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;type=CELL;type=VOICE;waid=${senderNum}:+${senderNum}\nEND:VCARD`;

      await socket.sendMessage(botJid, {
        contacts: {
          displayName: `📋 Saved: ${displayName}`,
          contacts: [{ displayName, vcard }]
        }
      });
      console.log(`[CONTACT SAVE] Auto-saved: ${senderNum} as "${displayName}"`);
    } catch (e) {
      console.error('[CONTACT SAVE] Error:', e.message);
    }
  });
}

// ---------------- Auto Message Read Handler ----------------

async function setupAutoMessageRead(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;

    // Quick return if no need to process
    const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
    const userConfig = await loadUserConfigFromMongo(sanitized) || {};
    const autoReadSetting = userConfig.AUTO_READ_MESSAGE || 'off';

    if (autoReadSetting === 'off') return;

    const from = msg.key.remoteJid;
    
    // Simple message body extraction
    let body = '';
    try {
      const type = getContentType(msg.message);
      const actualMsg = (type === 'ephemeralMessage') 
        ? msg.message.ephemeralMessage.message 
        : msg.message;

      if (type === 'conversation') {
        body = actualMsg.conversation || '';
      } else if (type === 'extendedTextMessage') {
        body = actualMsg.extendedTextMessage?.text || '';
      } else if (type === 'imageMessage') {
        body = actualMsg.imageMessage?.caption || '';
      } else if (type === 'videoMessage') {
        body = actualMsg.videoMessage?.caption || '';
      }
    } catch (e) {
      // If we can't extract body, treat as non-command
      body = '';
    }

    // Check if it's a command message
    const prefix = userConfig.PREFIX || config.PREFIX;
    const isCmd = body && body.startsWith && body.startsWith(prefix);

    // Apply auto read rules - SINGLE ATTEMPT ONLY
    if (autoReadSetting === 'all') {
      try { await socket.readMessages([msg.key]); } catch (e) {}
    } else if (autoReadSetting === 'cmd' && isCmd) {
      try { await socket.readMessages([msg.key]); } catch (e) {}
    }
  });
}

// ---------------- group participant event handler ----------------

async function setupGroupEventHandlers(socket, sessionNumber) {
  socket.ev.on('group-participants.update', async ({ id, participants, action }) => {
    if (!id || !participants || !participants.length) return;
    try {
      const settings = await getAllGroupSettings(id);
      let groupMeta;
      try { groupMeta = await socket.groupMetadata(id); } catch(e) { return; }
      const groupName = groupMeta.subject || 'this group';
      for (const participant of participants) {
        const num = participant.split('@')[0];
        if (action === 'add' && settings.WELCOME === 'on') {
          const customMsg = settings.WELCOME_MSG || `Welcome to *${groupName}*! 🎉 We're glad to have you here.`;
          await socket.sendMessage(id, { text: `👋 *Welcome!*\n@${num} ${customMsg}`, mentions: [participant] });
        } else if ((action === 'remove' || action === 'leave') && settings.GOODBYE === 'on') {
          const customMsg = settings.GOODBYE_MSG || `Goodbye! We'll miss you. 👋`;
          await socket.sendMessage(id, { text: `🚪 *Goodbye!*\n@${num} ${customMsg}`, mentions: [participant] });
        }
      }
    } catch(e) { console.log('GroupParticipantEvent error:', e); }
  });
}

// ---------------- message handlers ----------------

function setupMessageHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid === config.NEWSLETTER_JID) return;
    
    try {
      // Load user-specific config from MongoDB
      let autoTyping = config.AUTO_TYPING; // Default from global config
      let autoRecording = config.AUTO_RECORDING; // Default from global config
      
      if (sessionNumber) {
        const userConfig = await loadUserConfigFromMongo(sessionNumber) || {};
        
        // Check for auto typing in user config
        if (userConfig.AUTO_TYPING !== undefined) {
          autoTyping = userConfig.AUTO_TYPING;
        }
        
        // Check for auto recording in user config
        if (userConfig.AUTO_RECORDING !== undefined) {
          autoRecording = userConfig.AUTO_RECORDING;
        }
      }

      // Use auto typing setting (from user config or global)
      if (autoTyping === 'true') {
        try { 
          await socket.sendPresenceUpdate('composing', msg.key.remoteJid);
          // Stop typing after 3 seconds
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto typing error:', e);
        }
      }
      
      // Use auto recording setting (from user config or global)
      if (autoRecording === 'true') {
        try { 
          await socket.sendPresenceUpdate('recording', msg.key.remoteJid);
          // Stop recording after 3 seconds  
          setTimeout(async () => {
            try {
              await socket.sendPresenceUpdate('paused', msg.key.remoteJid);
            } catch (e) {}
          }, 3000);
        } catch (e) {
          console.error('Auto recording error:', e);
        }
      }
    } catch (error) {
      console.error('Message handler error:', error);
    }
  });
}


// ---------------- cleanup helper ----------------

async function deleteSessionAndCleanup(number, socketInstance) {
  const sanitized = number.replace(/[^0-9]/g, '');
  try {
    stopAllAutoTTSend(sanitized);
    stopAutoSongForNumber(sanitized);
    userConfigCache.delete(sanitized);
    const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
    try { if (fs.existsSync(sessionPath)) fs.removeSync(sessionPath); } catch(e){}
    activeSockets.delete(sanitized); socketCreationTime.delete(sanitized);
    try { await removeSessionFromMongo(sanitized); } catch(e){}
    try { await removeNumberFromMongo(sanitized); } catch(e){}
    try {
      const ownerJid = `${config.OWNER_NUMBER.replace(/[^0-9]/g,'')}@s.whatsapp.net`;
      const caption = formatMessage('*🥷 OWNER NOTICE — SESSION REMOVED*', `*𝐍umber:* ${sanitized}\n*𝐒ession 𝐑emoved 𝐃ue 𝐓o 𝐋ogout.*\n\n*𝐀ctive 𝐒essions 𝐍ow:* ${activeSockets.size}`, BOT_NAME_FANCY);
      if (socketInstance && socketInstance.sendMessage) await socketInstance.sendMessage(ownerJid, { image: { url: config.KEZU_IMG }, caption });
    } catch(e){}
    console.log(`Cleanup completed for ${sanitized}`);
  } catch (err) { console.error('deleteSessionAndCleanup error:', err); }
}

// ── clearSignalKeys: removes stale encryption keys to prevent Bad MAC ──
// Keeps creds.json (auth) intact; only clears Signal Protocol session keys.
async function clearSignalKeys(san) {
  const staleKeyPattern = /^(sender-key-|app-state-|pre-key-|session-|sn-|identity-)/;
  // 1. Clear from local temp folder
  try {
    const sessionPath = path.join(os.tmpdir(), `session_${san}`);
    if (fs.existsSync(sessionPath)) {
      for (const fname of fs.readdirSync(sessionPath)) {
        if (staleKeyPattern.test(fname)) {
          try { fs.removeSync(path.join(sessionPath, fname)); } catch(e) {}
        }
      }
      console.log(`[SIGNAL] ${san} — local signal keys cleared.`);
    }
  } catch(e) { console.warn(`[SIGNAL] local clear warning for ${san}:`, e.message); }
  // 2. Clean from MongoDB so restored session starts fresh
  try {
    await initMongo();
    const doc = await sessionsCol.findOne({ number: san });
    if (doc && doc.files && typeof doc.files === 'object') {
      const cleanedFiles = {};
      for (const [fname, content] of Object.entries(doc.files)) {
        if (!staleKeyPattern.test(fname)) cleanedFiles[fname] = content;
      }
      await sessionsCol.updateOne({ number: san }, { $set: { files: cleanedFiles, updatedAt: new Date() } });
      console.log(`[SIGNAL] ${san} — Mongo signal keys cleaned.`);
    }
  } catch(e) { console.warn(`[SIGNAL] Mongo clean warning for ${san}:`, e.message); }
}

// ---------------- auto-restart ----------------

function setupAutoRestart(socket, number) {
  socket.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection !== 'close') return;

    const san = number.replace(/[^0-9]/g, '');
    const errStr = String(lastDisconnect?.error || '');
    const statusCode = lastDisconnect?.error?.output?.statusCode
                       || lastDisconnect?.error?.statusCode
                       || (errStr.includes('401') ? 401 : undefined);
    console.log(`[DISCONNECT] ${san} — code:${statusCode || 'none'} reason:${errStr.slice(0,120)}`);

    // ── Logged out — clean up and stop ──
    const isLoggedOut = statusCode === 401
                        || (lastDisconnect?.error?.code === 'AUTHENTICATION')
                        || errStr.toLowerCase().includes('logged out')
                        || (lastDisconnect?.reason === DisconnectReason?.loggedOut);
    if (isLoggedOut) {
      console.log(`User ${number} logged out. Cleaning up...`);
      try { await deleteSessionAndCleanup(number, socket); } catch(e){ console.error(e); }
      return;
    }

    // ── Intentionally closed (re-pair) — skip ──
    if (intentionallyClosedNumbers.has(san)) {
      console.log(`Connection closed for ${san} intentionally. Skipping auto-restart.`);
      intentionallyClosedNumbers.delete(san);
      return;
    }

    // ── Already reconnecting for this number — skip duplicate ──
    if (reconnectInProgress.has(san)) {
      console.log(`[RECONNECT] Already in progress for ${san}, skipping duplicate.`);
      return;
    }

    // ── conflict:replaced — another connection took over, wait longer ──
    const isConflict = errStr.toLowerCase().includes('conflict')
                       || errStr.toLowerCase().includes('replaced')
                       || statusCode === 440 || statusCode === 409;

    activeSockets.delete(san);
    socketCreationTime.delete(san);
    reconnectInProgress.add(san);

    // ── Only clear signal keys on Bad MAC errors (not on every disconnect) ──
    const isBadMac = errStr.toLowerCase().includes('bad mac')
                  || errStr.toLowerCase().includes('bad_mac')
                  || errStr.toLowerCase().includes('badmac');
    if (isBadMac) {
      console.log(`[SIGNAL] ${san} — Bad MAC detected, clearing signal keys.`);
      await clearSignalKeys(san);
    }

    try {
      if (isConflict) {
        // ── Conflict (440/409): exponential backoff, give up after 5 attempts ──
        const cRetries = (conflictRetries.get(san) || 0) + 1;
        conflictRetries.set(san, cRetries);

        const MAX_CONFLICT_RETRIES = 5;
        if (cRetries > MAX_CONFLICT_RETRIES) {
          console.log(`[RECONNECT] ${san} — conflict limit reached (${cRetries-1}x). Pausing reconnects. Watchdog will retry later.`);
          conflictRetries.delete(san);
          reconnectInProgress.delete(san);
          return;
        }

        // 2min → 4min → 8min → 16min → 30min (capped)
        const conflictWaitMs = Math.min(2 * 60 * 1000 * Math.pow(2, cRetries - 1), 30 * 60 * 1000);
        console.log(`[RECONNECT] conflict:replaced for ${san} — attempt ${cRetries}/${MAX_CONFLICT_RETRIES}, waiting ${Math.round(conflictWaitMs/60000)}min before retry.`);
        await delay(conflictWaitMs);
      } else {
        // ── Normal disconnect: exponential backoff 10s → 20s → ... → 60s ──
        const retries = (reconnectRetries.get(san) || 0) + 1;
        reconnectRetries.set(san, retries);
        const waitMs = Math.min(10000 * Math.min(retries, 6), 60000);
        console.log(`[RECONNECT] ${san} — attempt ${retries} in ${waitMs/1000}s...`);
        await delay(waitMs);
      }

      if (activeSockets.has(san)) {
        console.log(`[RECONNECT] ${san} already active. Skipping.`);
        reconnectRetries.delete(san);
        conflictRetries.delete(san);
        return;
      }

      const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes };
      await EmpirePair(number, mockRes);
    } catch(e) {
      console.error(`[RECONNECT] attempt failed for ${san}:`, e.message);
    } finally {
      reconnectInProgress.delete(san);
    }
  });
}

// ──────────────── WATCHDOG: re-connect dead sessions every 5 min ────────────────
setInterval(async () => {
  try {
    const nums = await getAllNumbersFromMongo();
    if (!nums || !nums.length) return;
    for (const n of nums) {
      const san = n.replace(/[^0-9]/g, '');
      if (!activeSockets.has(san) && !reconnectInProgress.has(san)) {
        console.log(`[WATCHDOG] ${san} not active — reconnecting.`);
        reconnectInProgress.add(san);
        try {
          const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes };
          await EmpirePair(san, mockRes);
        } catch(e) {
          console.error(`[WATCHDOG] reconnect failed for ${san}:`, e.message);
        } finally {
          reconnectInProgress.delete(san);
        }
      }
    }
  } catch(e) {
    console.error('[WATCHDOG] error:', e.message);
  }
}, 15 * 60 * 1000); // every 15 min (was 5 min) — reduces RAM/CPU churn

// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------


// ---------------- EmpirePair (pairing, temp dir, persist to Mongo) ----------------

async function EmpirePair(number, res) {
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const sessionPath = path.join(os.tmpdir(), `session_${sanitizedNumber}`);
  await initMongo().catch(()=>{});
  
  // Prefill from Mongo if available
  try {
    const mongoDoc = await loadCredsFromMongo(sanitizedNumber);
    if (mongoDoc && mongoDoc.creds) {
      fs.ensureDirSync(sessionPath);
      // Restore all session files if available
      if (mongoDoc.files && typeof mongoDoc.files === 'object' && Object.keys(mongoDoc.files).length > 0) {
        for (const [fname, content] of Object.entries(mongoDoc.files)) {
          try { fs.writeFileSync(path.join(sessionPath, fname), content, 'utf8'); } catch(e) {}
        }
        console.log('Prefilled all session files from Mongo');
      } else {
        // Fallback: write just creds.json and keys.json
        fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(mongoDoc.creds, null, 2));
        if (mongoDoc.keys) fs.writeFileSync(path.join(sessionPath, 'keys.json'), JSON.stringify(mongoDoc.keys, null, 2));
        console.log('Prefilled creds from Mongo (legacy)');
      }
    }
  } catch (e) { console.warn('Prefill from Mongo failed', e); }

  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  const logger = pino({ level: 'silent' });

  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`Using WA version: ${version.join('.')} (latest: ${isLatest})`);

  try {
    const socket = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      printQRInTerminal: false,
      logger,
      browser: Browsers.macOS('Safari'),
      connectTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      retryRequestDelayMs: 2000,
      maxMsgRetryCount: 3,
      syncFullHistory: false,
      fireInitQueries: false,
      generateHighQualityLinkPreview: false,
      emitOwnEvents: false,
      defaultQueryTimeoutMs: 60000
    }, sanitizedNumber);

    socketCreationTime.set(sanitizedNumber, Date.now());

    setupStatusHandlers(socket, sanitizedNumber);
    setupCommandHandlers(socket, sanitizedNumber);
    setupMessageHandlers(socket, sanitizedNumber);
    setupAutoRestart(socket, sanitizedNumber);
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);
    setupAutoMessageRead(socket, sanitizedNumber);
    setupViewOnceHandler(socket, sanitizedNumber);
    setupAutoContactSave(socket, sanitizedNumber);
    setupCallRejection(socket, sanitizedNumber);
    setupGroupEventHandlers(socket, sanitizedNumber);

    if (!socket.authState.creds.registered) {
      let retries = config.MAX_RETRIES;
      let code;
     
      while (retries > 0) {
        try { await delay(500); code = await socket.requestPairingCode(sanitizedNumber); break; }
        
        catch (error) { retries--; await delay(800 * (config.MAX_RETRIES - retries)); }
      }
      if (!res.headersSent) res.send({ code });
    }

    socket.ev.on('creds.update', async () => {
      try {
        await saveCreds();
        
        const credsPath = path.join(sessionPath, 'creds.json');
        
        if (!fs.existsSync(credsPath)) return;
        const fileStats = fs.statSync(credsPath);
        if (fileStats.size === 0) return;
        
        const fileContent = await fs.readFile(credsPath, 'utf8');
        const trimmedContent = fileContent.trim();
        if (!trimmedContent || trimmedContent === '{}' || trimmedContent === 'null') return;
        
        let credsObj;
        try { credsObj = JSON.parse(trimmedContent); } catch (e) { return; }
        
        if (!credsObj || typeof credsObj !== 'object') return;
        
        const keysObj = state.keys || null;
        await saveCredsToMongo(sanitizedNumber, credsObj, keysObj, sessionPath);
        console.log('✅ Creds saved to MongoDB successfully');
        
      } catch (err) { 
        console.error('Failed saving creds on creds.update:', err);
      }
    });

    socket.ev.on('connection.update', async (update) => {
      const { connection } = update;
      if (connection === 'open') {
        try {
          // ── Reset retry counters on successful connect ──
          reconnectRetries.delete(sanitizedNumber);
          conflictRetries.delete(sanitizedNumber);
          await delay(800);
          const userJid = jidNormalizedUser(socket.user.id);
          const groupResult = await joinGroup(socket).catch(()=>({ status: 'failed', error: 'joinGroup not configured' }));

          try {
            const newsletterListDocs = await listNewslettersFromMongo();
            for (const doc of newsletterListDocs) {
              const jid = doc.jid;
              try { if (typeof socket.newsletterFollow === 'function') await socket.newsletterFollow(jid); } catch(e){}
            }
          } catch(e){}

          activeSockets.set(sanitizedNumber, socket);

          // ── Load & restart AutoTTSend intervals ──
          try {
            const ttConfigs = await getAutoTTSendConfigs(sanitizedNumber);
            const userCfgTT = await loadUserConfigFromMongo(sanitizedNumber) || {};
            const botNameTT = userCfgTT.botName || BOT_NAME_FANCY;
            for (const ttc of ttConfigs) {
              startAutoTTSendInterval(socket, sanitizedNumber, ttc.jid, ttc.title, botNameTT, ttc.intervalMinutes || 10);
            }
          } catch(e) { console.warn('AutoTTSend reload error:', e.message); }

          // ── Load & restart AutoSongSend intervals ──
          try {
            const songConfigs = await getAutoSongSendConfigs(sanitizedNumber);
            const userCfgSong = await loadUserConfigFromMongo(sanitizedNumber) || {};
            const botNameSong = userCfgSong.botName || BOT_NAME_FANCY;
            for (const sc of songConfigs) {
              startAutoSongInterval(socket, sanitizedNumber, sc.jid, sc.title, botNameSong, sc.intervalMinutes || 30);
            }
          } catch(e) { console.warn('AutoSongSend reload error:', e.message); }

          const groupStatus = groupResult.status === 'success' ? 'Joined successfully' : `Failed to join group: ${groupResult.error}`;

          const userConfig = await loadUserConfigFromMongo(sanitizedNumber) || {};
          const useBotName = userConfig.botName || BOT_NAME_FANCY;
          const useLogo = userConfig.logo || config.KEZU_IMG;

          const initialCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected*\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🕒 𝐂onnecting: Bot will become active in a few seconds*`,
            useBotName
          );

          let sentMsg = null;
          try {
            if (String(useLogo).startsWith('http')) {
              sentMsg = await socket.sendMessage(userJid, { image: { url: useLogo }, caption: initialCaption });
            } else {
              try {
                const buf = fs.readFileSync(useLogo);
                sentMsg = await socket.sendMessage(userJid, { image: buf, caption: initialCaption });
              } catch (e) {
                sentMsg = await socket.sendMessage(userJid, { image: { url: config.KEZU_IMG }, caption: initialCaption });
              }
            }
          } catch (e) {
            try { sentMsg = await socket.sendMessage(userJid, { text: initialCaption }); } catch(e){}
          }

          await delay(1200);

          const updatedCaption = formatMessage(useBotName,
            `*✅ 𝐒uccessfully 𝐂onnected 𝐀nd 𝐀𝐂𝐓𝐈𝐕𝐄\n\n*🔢 𝐍umber:* ${sanitizedNumber}\n*🩵 𝐒tatus:* ${groupStatus}\n*🕒 𝐂onnected 𝐀t:* ${getSriLankaTimestamp()}\n\n> 𝐬𝐭𝐚𝐭𝐮𝐬 𝐦𝐢𝐧𝐢: https://kezu-bc597f548bc3.herokuapp.com\n> 𝐦𝐚𝐢𝐧 𝐦𝐢𝐧𝐢 : https://criminalmd-98d941cf6e6f.herokuapp.com\n\n𝐲𝐨𝐮𝐫 𝐛𝐨𝐭 𝐚𝐜𝐭𝐢𝐯𝐞 𝐢𝐧 5 𝐦𝐢𝐧 𝐥𝐚𝐭𝐞𝐫\n\n> 𝐩𝐨𝐰𝐞𝐫𝐞𝐝 𝐛𝐲 𝐤𝐞𝐳𝐮 🩵`,
            useBotName
          );

          try {
            if (sentMsg && sentMsg.key) {
              try { await socket.sendMessage(userJid, { delete: sentMsg.key }); } catch (delErr) {}
            }
            try {
              if (String(useLogo).startsWith('http')) {
                await socket.sendMessage(userJid, { image: { url: useLogo }, caption: updatedCaption });
              } else {
                try {
                  const buf = fs.readFileSync(useLogo);
                  await socket.sendMessage(userJid, { image: buf, caption: updatedCaption });
                } catch (e) {
                  await socket.sendMessage(userJid, { text: updatedCaption });
                }
              }
            } catch (imgErr) {
              await socket.sendMessage(userJid, { text: updatedCaption });
            }
          } catch (e) {}


          await addNumberToMongo(sanitizedNumber);

        } catch (e) { 
          console.error('Connection open error:', e); 
          try { exec(`pm2.restart ${process.env.PM2_NAME || 'CHATUWA-MINI-main'}`); } catch(e) {}
        }
      }
    });

    // Note: activeSockets is set inside connection.update → 'open' event above.
    // Setting it here immediately would cause a duplicate socket entry before auth completes.

  } catch (error) {
    console.error('Pairing error:', error);
    socketCreationTime.delete(sanitizedNumber);
    reconnectInProgress.delete(sanitizedNumber);
    if (!res.headersSent) res.status(503).send({ error: 'Service Unavailable' });
  }
}


// ---------------- endpoints (admin/newsletter management + others) ----------------

router.post('/newsletter/add', async (req, res) => {
  const { jid, emojis } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  if (!jid.endsWith('@newsletter')) return res.status(400).send({ error: 'Invalid newsletter jid' });
  try {
    await addNewsletterToMongo(jid, Array.isArray(emojis) ? emojis : []);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/newsletter/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeNewsletterFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/newsletter/list', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.status(200).send({ status: 'ok', channels: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// admin endpoints

router.post('/admin/add', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await addAdminToMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.post('/admin/remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).send({ error: 'jid required' });
  try {
    await removeAdminFromMongo(jid);
    res.status(200).send({ status: 'ok', jid });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


router.get('/admin/list', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.status(200).send({ status: 'ok', admins: list });
  } catch (e) { res.status(500).send({ error: e.message || e }); }
});


// existing endpoints (connect, reconnect, active, etc.)

router.get('/', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).send({ error: 'Number parameter is required' });

  const sanitized = number.replace(/[^0-9]/g, '');

  // Close & remove existing active socket if any
  if (activeSockets.has(sanitized)) {
    const oldSocket = activeSockets.get(sanitized);
    intentionallyClosedNumbers.add(sanitized);
    try { oldSocket.ws.close(); } catch(e) {}
    activeSockets.delete(sanitized);
    socketCreationTime.delete(sanitized);
  }

  // Delete old session from MongoDB
  try {
    await initMongo();
    await sessionsCol.deleteOne({ number: sanitized });
    await numbersCol.deleteOne({ number: sanitized });
    userConfigCache.delete(sanitized);
    console.log(`Old session cleared for ${sanitized} — fresh pairing started`);
  } catch(e) { console.warn('Session cleanup before re-pair failed:', e.message); }

  // Remove temp session folder so EmpirePair starts completely fresh
  const sessionPath = path.join(os.tmpdir(), `session_${sanitized}`);
  try { fs.removeSync(sessionPath); } catch(e) {}

  await EmpirePair(number, res);
});


router.get('/active', (req, res) => {
  res.status(200).send({ botName: BOT_NAME_FANCY, count: activeSockets.size, numbers: Array.from(activeSockets.keys()), timestamp: getSriLankaTimestamp() });
});


router.get('/ping', (req, res) => {
  res.status(200).send({ status: 'active', botName: BOT_NAME_FANCY, message: '🤖 Status Assistant', activesession: activeSockets.size });
});

router.post('/setup-bot', async (req, res) => {
  const { number, botName, botLogo } = req.body;
  if (!number) return res.status(400).json({ error: 'number required' });
  const san = ('' + number).replace(/[^0-9]/g, '');
  try {
    const cfg = await loadUserConfigFromMongo(san) || {};
    if (botName && botName.trim()) cfg.botName = botName.trim();
    if (botLogo && botLogo.trim()) cfg.botLogo = botLogo.trim();
    await setUserConfigInMongo(san, cfg);
    res.json({ ok: true });
  } catch(e) {
    console.error('setup-bot error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/connect-all', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No numbers found to connect' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      await EmpirePair(number, mockRes);
      results.push({ number, status: 'connection_initiated' });
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Connect all error:', error); res.status(500).send({ error: 'Failed to connect all bots' }); }
});


router.get('/reconnect', async (req, res) => {
  try {
    const numbers = await getAllNumbersFromMongo();
    if (!numbers || numbers.length === 0) return res.status(404).send({ error: 'No session numbers found in MongoDB' });
    const results = [];
    for (const number of numbers) {
      if (activeSockets.has(number)) { results.push({ number, status: 'already_connected' }); continue; }
      const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
      try { await EmpirePair(number, mockRes); results.push({ number, status: 'connection_initiated' }); } catch (err) { results.push({ number, status: 'failed', error: err.message }); }
      await delay(1000);
    }
    res.status(200).send({ status: 'success', connections: results });
  } catch (error) { console.error('Reconnect error:', error); res.status(500).send({ error: 'Failed to reconnect bots' }); }
});

// Force-reconnect a specific number: clears signal keys then reconnects
router.post('/api/session/force-reconnect', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const san = ('' + number).replace(/[^0-9]/g, '');

    if (reconnectInProgress.has(san)) {
      return res.json({ ok: false, error: `${san} reconnect already in progress` });
    }

    // Close existing socket if any
    const existing = activeSockets.get(san);
    if (existing) {
      try { existing.ws?.close(); } catch(e) {}
      activeSockets.delete(san);
      socketCreationTime.delete(san);
    }

    reconnectInProgress.add(san);
    res.json({ ok: true, message: `Force reconnect started for ${san}` });

    // Run async — reconnect (signal keys only cleared on explicit Bad MAC, not force-reconnect)
    (async () => {
      try {
        const mockRes = { headersSent: false, send: () => {}, status: () => mockRes };
        await EmpirePair(san, mockRes);
        console.log(`[FORCE-RECONNECT] ${san} — reconnected successfully.`);
      } catch(e) {
        console.error(`[FORCE-RECONNECT] ${san} failed:`, e.message);
      } finally {
        reconnectInProgress.delete(san);
      }
    })();
  } catch(err) {
    console.error('force-reconnect error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});


router.get('/update-config', async (req, res) => {
  const { number, config: configString } = req.query;
  if (!number || !configString) return res.status(400).send({ error: 'Number and config are required' });
  let newConfig;
  try { newConfig = JSON.parse(configString); } catch (error) { return res.status(400).send({ error: 'Invalid config format' }); }
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const otp = generateOTP();
  otpStore.set(sanitizedNumber, { otp, expiry: Date.now() + config.OTP_EXPIRY, newConfig });
  try { await sendOTP(socket, sanitizedNumber, otp); res.status(200).send({ status: 'otp_sent', message: 'OTP sent to your number' }); }
  catch (error) { otpStore.delete(sanitizedNumber); res.status(500).send({ error: 'Failed to send OTP' }); }
});


router.get('/verify-otp', async (req, res) => {
  const { number, otp } = req.query;
  if (!number || !otp) return res.status(400).send({ error: 'Number and OTP are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const storedData = otpStore.get(sanitizedNumber);
  if (!storedData) return res.status(400).send({ error: 'No OTP request found for this number' });
  if (Date.now() >= storedData.expiry) { otpStore.delete(sanitizedNumber); return res.status(400).send({ error: 'OTP has expired' }); }
  if (storedData.otp !== otp) return res.status(400).send({ error: 'Invalid OTP' });
  try {
    await setUserConfigInMongo(sanitizedNumber, storedData.newConfig);
    otpStore.delete(sanitizedNumber);
    const sock = activeSockets.get(sanitizedNumber);
    if (sock) await sock.sendMessage(jidNormalizedUser(sock.user.id), { image: { url: config.KEZU_IMG }, caption: formatMessage('📌 CONFIG UPDATED', 'Your configuration has been successfully updated!', BOT_NAME_FANCY) });
    res.status(200).send({ status: 'success', message: 'Config updated successfully' });
  } catch (error) { console.error('Failed to update config:', error); res.status(500).send({ error: 'Failed to update config' }); }
});


router.get('/getabout', async (req, res) => {
  const { number, target } = req.query;
  if (!number || !target) return res.status(400).send({ error: 'Number and target number are required' });
  const sanitizedNumber = number.replace(/[^0-9]/g, '');
  const socket = activeSockets.get(sanitizedNumber);
  if (!socket) return res.status(404).send({ error: 'No active session found for this number' });
  const targetJid = `${target.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
  try {
    const statusData = await socket.fetchStatus(targetJid);
    const aboutStatus = statusData.status || 'No status available';
    const setAt = statusData.setAt ? moment(statusData.setAt).tz('Asia/Colombo').format('YYYY-MM-DD HH:mm:ss') : 'Unknown';
    res.status(200).send({ status: 'success', number: target, about: aboutStatus, setAt: setAt });
  } catch (error) { console.error(`Failed to fetch status for ${target}:`, error); res.status(500).send({ status: 'error', message: `Failed to fetch About status for ${target}.` }); }
});


// ---------------- Dashboard endpoints & static ----------------

const dashboardStaticDir = path.join(__dirname, 'dashboard_static');
if (!fs.existsSync(dashboardStaticDir)) fs.ensureDirSync(dashboardStaticDir);
router.use('/dashboard/static', express.static(dashboardStaticDir));
router.get('/dashboard', async (req, res) => {
  res.sendFile(path.join(dashboardStaticDir, 'index.html'));
});


// API: sessions & active & delete

router.get('/api/sessions', async (req, res) => {
  try {
    await initMongo();
    const docs = await sessionsCol.find({}, { projection: { number: 1, updatedAt: 1 } }).sort({ updatedAt: -1 }).toArray();
    res.json({ ok: true, sessions: docs });
  } catch (err) {
    console.error('API /api/sessions error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/active', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, active: keys, count: keys.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.post('/api/session/delete', async (req, res) => {
  try {
    const { number } = req.body;
    if (!number) return res.status(400).json({ ok: false, error: 'number required' });
    const sanitized = ('' + number).replace(/[^0-9]/g, '');
    const running = activeSockets.get(sanitized);
    if (running) {
      try { if (typeof running.logout === 'function') await running.logout().catch(()=>{}); } catch(e){}
      try { running.ws?.close(); } catch(e){}
      activeSockets.delete(sanitized);
      socketCreationTime.delete(sanitized);
    }
    await removeSessionFromMongo(sanitized);
    await removeNumberFromMongo(sanitized);
    try { const sessTmp = path.join(os.tmpdir(), `session_${sanitized}`); if (fs.existsSync(sessTmp)) fs.removeSync(sessTmp); } catch(e){}
    res.json({ ok: true, message: `Session ${sanitized} removed` });
  } catch (err) {
    console.error('API /api/session/delete error', err);
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


router.get('/api/newsletters', async (req, res) => {
  try {
    const list = await listNewslettersFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});
router.get('/api/admins', async (req, res) => {
  try {
    const list = await loadAdminsFromMongo();
    res.json({ ok: true, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || err });
  }
});


// ─── Dashboard Settings API ──────────────────────────────────────────────────

router.get('/api/config', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ ok: false, error: 'number required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const uc = await loadUserConfigFromMongo(san) || {};
    res.json({ ok: true, config: uc });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/config', async (req, res) => {
  const { number, config: newCfg } = req.body;
  if (!number || !newCfg) return res.status(400).json({ ok: false, error: 'number and config required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const existing = await loadUserConfigFromMongo(san) || {};
    const merged = { ...existing, ...newCfg };
    await setUserConfigInMongo(san, merged);
    res.json({ ok: true, message: 'Config updated successfully' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

router.get('/api/sessions/list', async (req, res) => {
  try {
    const keys = Array.from(activeSockets.keys());
    res.json({ ok: true, sessions: keys, count: keys.length });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Group Management API ────────────────────────────────────────────────────

router.get('/api/group', async (req, res) => {
  const { jid } = req.query;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  try {
    const settings = await getAllGroupSettings(jid);
    res.json({ ok: true, settings });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/group', async (req, res) => {
  const { jid, settings } = req.body;
  if (!jid || !settings) return res.status(400).json({ ok: false, error: 'jid and settings required' });
  try {
    await setAllGroupSettings(jid, settings);
    res.json({ ok: true, message: 'Group settings saved' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/sessions/format-all', async (req, res) => {
  const { password } = req.body;
  if (password !== 'kezu') return res.status(401).json({ ok: false, error: 'Wrong password' });
  try {
    await initMongo();
    await sessionsCol.deleteMany({});
    await numbersCol.deleteMany({});
    activeSockets.forEach((socket, number) => {
      try { socket.ws.close(); } catch (e) {}
      activeSockets.delete(number);
      socketCreationTime.delete(number);
      try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
    });
    userConfigCache.clear();
    console.log('All sessions formatted by dashboard request');
    res.json({ ok: true, message: 'All sessions formatted successfully' });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.get('/api/groups/list', async (req, res) => {
  const { number } = req.query;
  if (!number) return res.status(400).json({ ok: false, error: 'number required' });
  const san = number.replace(/[^0-9]/g, '');
  try {
    const sock = activeSockets.get(san);
    if (!sock) return res.status(404).json({ ok: false, error: 'No active session for this number' });
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map(g => ({ jid: g.id, name: g.subject, participants: g.participants ? g.participants.length : 0 }));
    res.json({ ok: true, groups: list });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ─── Channel Settings API ─────────────────────────────────────────────────────

router.post('/api/channel/follow-all', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  const normalizedJid = jid.trim().endsWith('@newsletter') ? jid.trim() : `${jid.trim()}@newsletter`;
  const results = [];
  const sockets = Array.from(activeSockets.entries());
  if (sockets.length === 0) return res.status(404).json({ ok: false, error: 'No active sessions connected' });
  for (const [number, socket] of sockets) {
    try {
      if (typeof socket.newsletterFollow === 'function') {
        await socket.newsletterFollow(normalizedJid);
        results.push({ number, status: 'followed' });
      } else {
        results.push({ number, status: 'skipped', reason: 'newsletterFollow not available' });
      }
    } catch(e) {
      results.push({ number, status: 'error', reason: e.message });
    }
  }
  const succeeded = results.filter(r => r.status === 'followed').length;
  res.json({ ok: true, jid: normalizedJid, total: sockets.length, succeeded, results });
});

router.post('/api/channel/react-all', async (req, res) => {
  let { jid, emojis } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  const normalizedJid = jid.trim().endsWith('@newsletter') ? jid.trim() : `${jid.trim()}@newsletter`;
  const emojisArr = Array.isArray(emojis) && emojis.length > 0 ? emojis : ['❤️'];
  try {
    await addNewsletterReactConfig(normalizedJid, emojisArr);
  } catch(e) {
    return res.status(500).json({ ok: false, error: 'Failed to save react config: ' + e.message });
  }
  const results = [];
  const sockets = Array.from(activeSockets.entries());
  for (const [number, socket] of sockets) {
    try {
      if (typeof socket.newsletterFollow === 'function') {
        await socket.newsletterFollow(normalizedJid);
        results.push({ number, status: 'followed+react_set' });
      } else {
        results.push({ number, status: 'react_set', reason: 'newsletterFollow not available' });
      }
    } catch(e) {
      results.push({ number, status: 'error', reason: e.message });
    }
  }
  const succeeded = results.filter(r => r.status === 'followed+react_set').length;
  res.json({ ok: true, jid: normalizedJid, emojis: emojisArr, total: sockets.length, succeeded, results });
});

router.get('/api/channel/react-list', async (req, res) => {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    res.json({ ok: true, list: docs });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

router.post('/api/channel/react-remove', async (req, res) => {
  const { jid } = req.body;
  if (!jid) return res.status(400).json({ ok: false, error: 'jid required' });
  try {
    await removeNewsletterReactConfig(jid);
    res.json({ ok: true, message: 'React config removed for ' + jid });
  } catch(e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ---------------- cleanup + process events ----------------

process.on('exit', () => {
  activeSockets.forEach((socket, number) => {
    try { socket.ws.close(); } catch (e) {}
    activeSockets.delete(number);
    socketCreationTime.delete(number);
    try { fs.removeSync(path.join(os.tmpdir(), `session_${number}`)); } catch(e){}
  });
});


process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION] Bot will continue running:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION] Bot will continue running. Reason:', reason);
});


// initialize mongo & auto-reconnect attempt

initMongo().catch(err => console.warn('Mongo init failed at startup', err));
(async()=>{
  try {
    const nums = await getAllNumbersFromMongo();
    if (!nums || !nums.length) return;
    for (const n of nums) {
      const san = n.replace(/[^0-9]/g, '');
      if (activeSockets.has(san) || reconnectInProgress.has(san)) continue;
      reconnectInProgress.add(san);
      try {
        const mockRes = { headersSent:false, send:()=>{}, status:()=>mockRes };
        await EmpirePair(san, mockRes);
      } catch(e) {
        console.error(`[STARTUP] failed for ${san}:`, e.message);
      } finally {
        reconnectInProgress.delete(san);
      }
      await delay(3000); // stagger 3s between each session startup
    }
  } catch(e) { console.error('[STARTUP] error:', e.message); }
})();

module.exports = router;


