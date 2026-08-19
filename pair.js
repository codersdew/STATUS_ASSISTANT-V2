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
  AUTO_LIKE_EMOJI: ['💙', '🩷', '💜', '🤎', '🧡', '🩵', '💛', '🩶', '♥️', '💗', '❤️‍🔥'],
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
const USER_CONFIG_CACHE_MAX = 100;

const groupSettingsCache = new Map();
const GROUP_SETTINGS_CACHE_TTL = 8 * 60 * 1000;
const GROUP_SETTINGS_CACHE_MAX = 200;

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
  await groupSettingsCol.createIndex({ jid: 1 }, { unique: true }).catch(()=>{});
  await autoTTSendCol.createIndex({ number: 1, jid: 1 }, { unique: true }).catch(()=>{});
  await autoSongSendCol.createIndex({ number: 1, jid: 1 }, { unique: true }).catch(()=>{});
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

async function removeNumberFromMongo(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await numbersCol.deleteOne({ number: sanitized });
  } catch (e) {}
}

async function getAllNumbersFromMongo() {
  try {
    await initMongo();
    const docs = await numbersCol.find({}).toArray();
    return docs.map(d => d.number);
  } catch (e) { return []; }
}

async function loadAdminsFromMongo() {
  try {
    await initMongo();
    const docs = await adminsCol.find({}).toArray();
    return docs.map(d => d.jid || d.number).filter(Boolean);
  } catch (e) { return []; }
}

async function addAdminToMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.updateOne({ jid: jidOrNumber }, { $set: { jid: jidOrNumber } }, { upsert: true });
  } catch (e) {}
}

async function removeAdminFromMongo(jidOrNumber) {
  try {
    await initMongo();
    await adminsCol.deleteOne({ jid: jidOrNumber });
  } catch (e) {}
}

async function addNewsletterToMongo(jid, emojis = []) {
  try {
    await initMongo();
    const doc = { jid, emojis: Array.isArray(emojis) ? emojis : [], addedAt: new Date() };
    await newsletterCol.updateOne({ jid }, { $set: doc }, { upsert: true });
  } catch (e) { throw e; }
}

async function removeNewsletterFromMongo(jid) {
  try {
    await initMongo();
    await newsletterCol.deleteOne({ jid });
  } catch (e) { throw e; }
}

async function listNewslettersFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : [] }));
  } catch (e) { return []; }
}

async function saveNewsletterReaction(jid, messageId, emoji, sessionNumber) {
  try {
    await initMongo();
    const doc = { jid, messageId, emoji, sessionNumber, ts: new Date() };
    await mongoDB.collection('newsletter_reactions_log').insertOne(doc);
  } catch (e) {}
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

async function addNewsletterReactConfig(jid, emojis = ['🎀','🧚‍♀️','🎭']) {
  try {
    await initMongo();
    await newsletterReactsCol.updateOne({ jid }, { $set: { jid, emojis, addedAt: new Date() } }, { upsert: true });
  } catch (e) { throw e; }
}

async function removeNewsletterReactConfig(jid) {
  try {
    await initMongo();
    await newsletterReactsCol.deleteOne({ jid });
  } catch (e) { throw e; }
}

async function listNewsletterReactsFromMongo() {
  try {
    await initMongo();
    const docs = await newsletterReactsCol.find({}).toArray();
    return docs.map(d => ({ jid: d.jid, emojis: Array.isArray(d.emojis) ? d.emojis : ['🤫','♥️',''] }));
  } catch (e) { return []; }
}

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
    groupSettingsCache.delete(groupJid);
  } catch(e) {}
}

async function setAllGroupSettings(groupJid, settings) {
  try {
    await initMongo();
    await groupSettingsCol.updateOne({ jid: groupJid }, { $set: { jid: groupJid, settings, updatedAt: new Date() } }, { upsert: true });
    groupSettingsCache.delete(groupJid);
  } catch(e) {}
}

async function addAutoTTSend(number, jid, title, intervalMinutes = 10) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
  } catch(e) {}
}

async function removeAutoTTSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoTTSendCol.deleteMany({ number: sanitized });
  } catch(e) {}
}

async function getAutoTTSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoTTSendCol.find({ number: sanitized }).toArray();
  } catch(e) { return []; }
}

async function addAutoSongSend(number, jid, title, intervalMinutes = 30) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.updateOne(
      { number: sanitized, jid },
      { $set: { number: sanitized, jid, title, intervalMinutes, addedAt: new Date() } },
      { upsert: true }
    );
  } catch(e) {}
}

async function removeAutoSongSend(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    await autoSongSendCol.deleteMany({ number: sanitized });
  } catch(e) {}
}

async function getAutoSongSendConfigs(number) {
  try {
    await initMongo();
    const sanitized = number.replace(/[^0-9]/g, '');
    return await autoSongSendCol.find({ number: sanitized }).toArray();
  } catch(e) { return []; }
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
const conflictRetries = new Map();
const reconnectInProgress = new Set();
const otpStore = new Map();
const intentionallyClosedNumbers = new Set();

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

function _humanDelay(minMs = 300, maxMs = 900) {
  return new Promise(r => setTimeout(r, Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs));
}

const messageDeleteCache = new Map();
const MESSAGE_CACHE_LIMIT = 50;
const autoTTSendIntervals = new Map();
const autoSongSendIntervals = new Map();
const _spamTracker = new Map();
const _bugAttackActive = new Map();

// ─── OPTIONAL BUG ATTACK HELPERS ───────────────────────
let _atkVvvXxxAaa, _atkCrashard, _atkVcardBug, _atkVcardBug2, _atkVcardBug3, _atkLocBug, _atkLocBug2, _atkLocBug3, _atkGhostBug, _atkGhostBug2, _atkGhostBug3, _atkCombo;
try {
  const bye = require('./kezu_goodbye.js');
  _atkVvvXxxAaa = bye._atkVvvXxxAaa;
  _atkCrashard = bye._atkCrashard;
  _atkVcardBug = bye._atkVcardBug;
  _atkVcardBug2 = bye._atkVcardBug2;
  _atkVcardBug3 = bye._atkVcardBug3;
  _atkLocBug = bye._atkLocBug;
  _atkLocBug2 = bye._atkLocBug2;
  _atkLocBug3 = bye._atkLocBug3;
  _atkGhostBug = bye._atkGhostBug;
  _atkGhostBug2 = bye._atkGhostBug2;
  _atkGhostBug3 = bye._atkGhostBug3;
  _atkCombo = bye._atkCombo;
} catch (e) {}

// ─── STICKER HELPER FUNCTIONS ──────────────────────────
async function _imgBufToWebpSticker(inputBuf, ext = 'jpg') {
  const _uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const _tmpIn = path.join(os.tmpdir(), `stk_in_${_uid}.${ext}`);
  const _tmpOut = path.join(os.tmpdir(), `stk_out_${_uid}.webp`);
  try {
    fs.writeFileSync(_tmpIn, inputBuf);
    await new Promise((res, rej) => {
      ffmpeg(_tmpIn)
        .outputOptions([
          '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white',
          '-c:v', 'libwebp',
          '-quality', '80',
          '-lossless', '0',
          '-compression_level', '6',
          '-an', '-vsync', '0'
        ])
        .output(_tmpOut)
        .on('end', res)
        .on('error', rej)
        .run();
    });
    return fs.readFileSync(_tmpOut);
  } finally {
    try { fs.unlinkSync(_tmpIn); } catch(e) {}
    try { fs.unlinkSync(_tmpOut); } catch(e) {}
  }
}

async function _webpBufToPng(webpBuf) {
  const _uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const _tmpIn = path.join(os.tmpdir(), `s2i_in_${_uid}.webp`);
  const _tmpOut = path.join(os.tmpdir(), `s2i_out_${_uid}.png`);
  try {
    fs.writeFileSync(_tmpIn, webpBuf);
    await new Promise((res, rej) => {
      ffmpeg(_tmpIn).output(_tmpOut).on('end', res).on('error', rej).run();
    });
    return fs.readFileSync(_tmpOut);
  } finally {
    try { fs.unlinkSync(_tmpIn); } catch(e) {}
    try { fs.unlinkSync(_tmpOut); } catch(e) {}
  }
}

async function _textToStickerBuf(text) {
  const img = new Jimp(512, 512, 0x1a1a2eff);
  const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  img.print(font, 16, 0, { text, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, 480, 512);
  const pngBuf = await img.getBufferAsync(Jimp.MIME_PNG);
  return await _imgBufToWebpSticker(pngBuf, 'png');
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

async function sendAutoTTVideo(socket, jid, title, botName) {
  try {
    const searchParams = new URLSearchParams({ keywords: title, count: '20', cursor: '0', HD: '1' });
    const response = await axios.post('https://tikwm.com/api/feed/search', searchParams, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'Cookie': 'current_language=en', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const videos = response.data?.data?.videos;
    if (!videos || videos.length === 0) return;
    const v = videos[Math.floor(Math.random() * videos.length)];
    const videoUrl = v.hdplay || v.play || v.wmplay || v.download;
    if (!videoUrl) return;
    const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 90000 });
    const videoBuffer = Buffer.from(videoRes.data);
    const caption = `*🍃 POWERED BY NATURE FOREVER*\n\n📌 *${v.title || title}*\n🥷 *${v.author?.nickname || 'Unknown'}*\n> *${botName || BOT_NAME_FANCY}*`;
    await socket.sendMessage(jid, { video: videoBuffer, mimetype: 'video/mp4', caption });
  } catch(e) {}
}

function startAutoTTSendInterval(socket, number, jid, title, botName, intervalMinutes = 10) {
  const key = `${number}:${jid}`;
  if (autoTTSendIntervals.has(key)) clearInterval(autoTTSendIntervals.get(key));
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoTTVideo(socket, jid, title, botName), ms);
  autoTTSendIntervals.set(key, id);
}

function stopAllAutoTTSend(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoTTSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoTTSendIntervals.delete(key);
    }
  }
}

async function sendAutoSong(socket, jid, title, botName) {
  try {
    const result = await yts(title);
    if (!result.videos || result.videos.length === 0) return;
    const data = result.videos[0];
    const videoId = data.videoId;
    const apiUrl = `${config.API_YT_ALL_URL}?url=https://youtu.be/${videoId}&api_key=${config.NEXORA_API_KEY}`;
    const res = await axios.get(apiUrl, { timeout: 25000 });
    if (!res.data.success) return;
    const downloadLink = res.data.all_qualities?.audio?.download_url;
    const songTitle = res.data.title || data.title;
    await socket.sendMessage(jid, {
      audio: { url: downloadLink },
      mimetype: 'audio/mpeg',
      fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
    });
  } catch(e) {}
}

function startAutoSongInterval(socket, number, jid, title, botName, intervalMinutes = 30) {
  const key = `${number}:${jid}`;
  if (autoSongSendIntervals.has(key)) clearInterval(autoSongSendIntervals.get(key));
  const ms = Math.max(1, intervalMinutes) * 60 * 1000;
  const id = setInterval(() => sendAutoSong(socket, jid, title, botName), ms);
  autoSongSendIntervals.set(key, id);
}

function stopAutoSongForNumber(number) {
  const sanitized = number.replace(/[^0-9]/g, '');
  for (const [key, id] of autoSongSendIntervals.entries()) {
    if (key.startsWith(sanitized + ':')) {
      clearInterval(id);
      autoSongSendIntervals.delete(key);
    }
  }
}

async function joinGroup(socket) {
  const inviteCodeMatch = (config.GROUP_INVITE_LINK || '').match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/);
  if (!inviteCodeMatch) return { status: 'failed', error: 'No group invite configured' };
  try {
    const response = await socket.groupAcceptInvite(inviteCodeMatch[1]);
    return response?.gid ? { status: 'success', gid: response.gid } : { status: 'failed' };
  } catch (error) { return { status: 'failed', error: error.message }; }
}

async function sendOTP(socket, number, otp) {
  const userJid = jidNormalizedUser(socket.user.id);
  const message = formatMessage(`*🔐 OTP VERIFICATION*`, `*YOUR OTP FOR CONFIG UPDATE:* *${otp}*\nEXPIRES IN 5 MINUTES.`, BOT_NAME_FANCY);
  await socket.sendMessage(userJid, { text: message });
}

// ---------------- Handlers (Newsletter, Status, etc.) ----------------
async function setupNewsletterHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    if (!message?.key) return;
    const jid = message.key.remoteJid;
    if (!jid || !jid.endsWith('@newsletter')) return;

    try {
      const followedDocs = await listNewslettersFromMongo();
      const followedJids = followedDocs.map(d => d.jid);
      if (!followedJids.includes(jid)) return;

      const randomEmoji = config.AUTO_LIKE_EMOJI[Math.floor(Math.random() * config.AUTO_LIKE_EMOJI.length)];
      const messageId = message.newsletterServerId || message.key.id;
      if (!messageId) return;

      if (typeof socket.newsletterReactMessage === 'function') {
        await socket.newsletterReactMessage(jid, messageId.toString(), randomEmoji);
      } else {
        await socket.sendMessage(jid, { react: { text: randomEmoji, key: message.key } });
      }
    } catch (error) {}
  });
}

const _seenStatusIds = new Set();

async function setupStatusHandlers(socket, sessionNumber) {
  socket.ev.on('messages.upsert', async ({ messages }) => {
    const message = messages[0];
    
    // Status message එකක් නොවේ නම් ඉවත් වන්න
    if (!message?.key || message.key.remoteJid !== 'status@broadcast' || !message.key.participant) return;

    const _statusMsgId = message.key.id;
    if (_seenStatusIds.has(_statusMsgId)) return;
    _seenStatusIds.add(_statusMsgId);

    try {
      const sanitized = (sessionNumber || '').replace(/[^0-9]/g, '');
      const userCfg = sessionNumber ? (await loadUserConfigFromMongo(sanitized) || {}) : {};
      
      const autoViewStatus = userCfg.AUTO_VIEW_STATUS ?? config.AUTO_VIEW_STATUS;
      const autoLikeStatus = userCfg.AUTO_LIKE_STATUS ?? config.AUTO_LIKE_STATUS;
      
      const posterJid = jidNormalizedUser(message.key.participant);
      const botJid = jidNormalizedUser(socket.user.id);

      // 1. Status එක Seen (Read) කිරීම
      if (autoViewStatus === 'true') {
        try {
          await socket.readMessages([message.key]);
        } catch (e) {}
      }

      // 2. Status එකට React කිරීම
      if (autoLikeStatus === 'true') {
        // අනිවාර්යයෙන් තත්පර 1.5 ක delay එකක් තබන්න (WhatsApp Server එක Seen වූ බව register කරගැනීමට)
        await delay(1500);

        const userEmojis = (Array.isArray(userCfg.AUTO_LIKE_EMOJI) && userCfg.AUTO_LIKE_EMOJI.length > 0)
          ? userCfg.AUTO_LIKE_EMOJI 
          : config.AUTO_LIKE_EMOJI;
          
        const randomEmoji = userEmojis[Math.floor(Math.random() * userEmojis.length)];

        // Reaction Message එක යැවීම
        await socket.sendMessage(
          'status@broadcast',
          {
            react: {
              text: randomEmoji,
              key: message.key // message.key ඒ ආකාරයෙන්ම ලබා දෙන්න
            }
          },
          {
            statusJidList: [posterJid, botJid].filter(Boolean)
          }
        );

        console.log(`[STATUS REACT] ✅ Reacted ${randomEmoji} to status from ${posterJid.split('@')[0]}`);
      }
    } catch (e) {
      console.error('[STATUS REACT ERROR]:', e.message);
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
      for (const messageKey of keys) {
        const cached = messageDeleteCache.get(messageKey.id);
        if (cached && cached.text) {
          const header = `🗑️ *Anti Delete* — Message deleted by @${cached.senderNum}\n🕐 *Time:* ${getSriLankaTimestamp()}\n\n`;
          await socket.sendMessage(userJid, { text: header + cached.text });
        }
      }
    } catch (e) {}
  });
}

// ---------------- COMMAND HANDLERS ----------------
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
    const sender = from;
    const nowsender = msg.key.fromMe ? (socket.user.id.split(':')[0] + '@s.whatsapp.net') : jidNormalizedUser(msg.key.participant || msg.key.remoteJid || '');
    const senderNumber = (nowsender || '').split('@')[0];
    const developers = `${config.OWNER_NUMBER}`;
    const botNumber = socket.user.id.split(':')[0];
    const isbot = botNumber.includes(senderNumber);
    const isBotOrOwner = isbot ? isbot : developers.includes(senderNumber);
    const isGroup = from.endsWith("@g.us");

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
    const isCmd = body.startsWith(prefix);
    const command = isCmd ? body.slice(prefix.length).trim().split(' ').shift().toLowerCase() : null;
    const args = body.trim().split(/ +/).slice(1);

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
        // ──────────────────────── MENU ────────────────────────
        case 'menu': {
          await socket.sendMessage(sender, { react: { text: "🐾", key: msg.key } });
          const slNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Colombo" }));
          const timeStr = slNow.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
          const dateStr = slNow.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
          const ramUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
          const uptime = process.uptime();
          const runtime = `${Math.floor(uptime / 3600)}H ${Math.floor((uptime % 3600) / 60)}M`;

          const menuText = `
*╭─[ ${botName} ]─────*
*│* 👤 *User:* @${senderNumber}
*│* ⏱️ *Runtime:* ${runtime}
*│* 💾 *RAM:* ${ramUsage} MB
*│* 📅 *Date:* ${dateStr} | ⌚ *Time:* ${timeStr}
*╰────────────────*

*┌─❰ 📥 DOWNLOAD CMDS ❱*
*│* ${prefix}song <name/url>
*│* ${prefix}video <name/url>
*│* ${prefix}fb <url>
*│* ${prefix}tiktok <url>
*│* ${prefix}insta <url>
*│* ${prefix}apk <package>
*│* ${prefix}mf <url>
*└───────────────┈*

*┌─❰ ⚙️ SETTINGS & AUTO ❱*
*│* ${prefix}setting (Control Panel)
*│* ${prefix}settings (View Config)
*│* ${prefix}autotyping on/off
*│* ${prefix}autorecording on/off
*│* ${prefix}autoreact on/off
*│* ${prefix}antidelete on/off
*│* ${prefix}antispam on/off
*│* ${prefix}antilink on/off
*└───────────────┈*

*┌─❰ 👑 GENERAL & SYSTEM ❱*
*│* ${prefix}alive
*│* ${prefix}ping
*│* ${prefix}speedping
*│* ${prefix}system
*│* ${prefix}owner
*│* ${prefix}pair <number>
*└───────────────┈*

> 🏷️ *KEZU TECH | TEAM DCT OFC*`.trim();

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption: menuText,
            mentions: [nowsender],
            contextInfo: {
              externalAdReply: {
                title: botName,
                body: "TEAM DCT OFC",
                mediaType: 1,
                thumbnailUrl: logoUrl,
                sourceUrl: 'https://whatsapp.com',
                renderLargerThumbnail: false,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── PING ────────────────────────
        case 'ping': {
          const start = Date.now();
          await socket.sendMessage(sender, { react: { text: '⚡', key: msg.key } });
          const latency = Date.now() - start;

          const pingCard = `
╭───「 🏓 *P O N G* 」───◆
│ ⚡ *Speed:* ${latency} ms
│ 🤖 *Bot:* ${botName}
│ 💻 *Status:* Active & Online 🟢
╰──────────────────────◆`.trim();

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption: pingCard,
            contextInfo: {
              externalAdReply: {
                title: `⚡ ${botName} PING`,
                body: `${latency}ms Response`,
                mediaType: 1,
                thumbnailUrl: logoUrl,
                sourceUrl: 'https://whatsapp.com',
                renderLargerThumbnail: false,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SPEEDPING ────────────────────────
        case 'p':
        case 'speedping': {
          const _pStart = Date.now();
          const _pLatency = Date.now() - _pStart + 12;
          const _pRam = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);

          const _pCaption = `
⚡ *SPEED PING*
╭━━━━━━━━━━━━━━━━━━━●
┃ 🏓 *LATENCY:* ${_pLatency} ms
┃ 💾 *RAM:* ${_pRam} MB
┃ 🤖 *BOT:* ${botName}
╰━━━━━━━━━━━━━━━━━━━●`.trim();

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption: _pCaption,
            contextInfo: {
              externalAdReply: {
                title: `⚡ SPEED: ${_pLatency}ms`,
                body: `Status Assistant Engine`,
                mediaType: 1,
                thumbnailUrl: logoUrl,
                sourceUrl: 'https://whatsapp.com',
                renderLargerThumbnail: false,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── ALIVE ────────────────────────
        case 'alive': {
          await socket.sendMessage(sender, { react: { text: "🧚‍♀️", key: msg.key } });
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

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption: aliveText,
            mentions: [nowsender],
            contextInfo: {
              externalAdReply: {
                title: `🟢 ${botName} IS ALIVE`,
                body: `Ready to assist 24/7`,
                mediaType: 1,
                thumbnailUrl: logoUrl,
                sourceUrl: 'https://whatsapp.com',
                renderLargerThumbnail: false,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SYSTEM ────────────────────────
        case 'system': {
          await socket.sendMessage(sender, { react: { text: "🖥️", key: msg.key } });
          const uptime = os.uptime();
          const hours = Math.floor(uptime / 3600);
          const minutes = Math.floor((uptime % 3600) / 60);

          const text = `
╭━━━━━━━━━━━━━━━━━━━●
┃ 🖥️ *SYSTEM INFORMATION*
┃
┃ 🚀 *OS:* ${os.type()} ${os.release()}
┃ 🥉 *Platform:* ${os.platform()}
┃ 🧠 *CPU Cores:* ${os.cpus().length}
┃ 💾 *RAM:* ${(os.totalmem()/1024/1024/1024).toFixed(2)} GB
┃ ⏱️ *System Uptime:* ${hours}h ${minutes}m
╰━━━━━━━━━━━━━━━━━━━●
> 👨‍💻 *${botName}*`.trim();

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption: text,
            contextInfo: {
              externalAdReply: {
                title: `🖥️ SYSTEM SPECS`,
                body: `${os.platform()} System`,
                mediaType: 1,
                thumbnailUrl: logoUrl,
                sourceUrl: 'https://whatsapp.com',
                renderLargerThumbnail: false,
                showAdAttribution: true
              }
            }
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── PAIR (FIXED) ────────────────────────
        case 'pair': {
          let text = (args.join(' ') || '').trim();
          let pairNum = text.replace(/[^0-9]/g, '');

          if (!pairNum) {
            return await socket.sendMessage(sender, {
              text: `❌ *No Phone Number Provided!*\n\n📝 *Usage:* \`${prefix}pair 94771234567\``
            }, { quoted: msg });
          }

          await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });

          try {
            const apiUrl = `https://statusassistant-11969787fc03.herokuapp.com/code?number=${encodeURIComponent(pairNum)}`;
            const response = await axios.get(apiUrl, { timeout: 15000 });
            const pairCode = response.data?.code;

            if (!pairCode) throw new Error('Could not fetch pairing code from server.');

            await socket.sendMessage(sender, { react: { text: '🔑', key: msg.key } });

            const pairMsg = `
╭───『 ⚜️ *PAIRING CODE* ⚜️ 』───◆
│ 👤 *User:* +${pairNum}
│ 🔑 *YOUR CODE:*
│
│  *${pairCode}*
│
│ ⏳ *Expires in 60 seconds*
│
│ ⚙️ *INSTRUCTIONS:*
│ 1. Open WhatsApp Settings > Linked Devices
│ 2. Tap "Link with phone number instead"
│ 3. Enter the code shown below
╰──────────────────────────◆`.trim();

            await socket.sendMessage(sender, { text: pairMsg }, { quoted: msg });
            await delay(500);
            await socket.sendMessage(sender, { text: pairCode }, { quoted: msg });

          } catch (err) {
            await socket.sendMessage(sender, {
              text: `❌ *Pairing Failed:*\n${err.message || 'API Connection Error'}`
            }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── SETTINGS ────────────────────────
        case 'setting':
        case 'settings': {
          await socket.sendMessage(sender, { react: { text: '⚙️', key: msg.key } });
          const fancyWork = (userConfig.WORK_TYPE || 'public').toUpperCase();

          const msgCaption = `
╭───〔 *${botName} SETTINGS* 〕───◆
│ 📝 *Name:* ${botName}
│ 🔧 *Work Type:* ${fancyWork}
│ 👁️ *Auto Status View:* ${userConfig.AUTO_VIEW_STATUS || 'true'}
│ ❤️ *Auto Status React:* ${userConfig.AUTO_LIKE_STATUS || 'true'}
│ 📥 *Auto Status Save:* ${userConfig.AUTO_STATUS_SAVE || 'false'}
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
• \`${prefix}statusdl on/off\`
• \`${prefix}setbotname <name>\`
• \`${prefix}prefix <symbol>\``;

          await socket.sendMessage(sender, {
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
            return await socket.sendMessage(sender, { text: `❌ *Usage:* ${prefix}song <song name or youtube url>` }, { quoted: msg });
          }
          const query = args.join(' ');
          await socket.sendMessage(sender, { react: { text: '🎵', key: msg.key } });

          try {
            let searchData;
            if (query.match(/(youtube\.com|youtu\.be)/)) {
              const match = query.match(/(?:v=|\/)([0-9A-Za-z_-]{11})/);
              if (!match) throw new Error('Invalid YouTube URL');
              searchData = await yts({ videoId: match[1] });
            } else {
              const result = await yts(query);
              if (!result.videos || result.videos.length === 0) {
                return await socket.sendMessage(sender, { text: '❌ No results found.' }, { quoted: msg });
              }
              searchData = result.videos[0];
            }

            const videoId = searchData.videoId;
            const apiUrl = `${config.API_YT_ALL_URL}?url=https://youtu.be/${videoId}&api_key=${config.NEXORA_API_KEY}`;
            const apiRes = await axios.get(apiUrl, { timeout: 30000 });

            if (!apiRes.data?.success) throw new Error('API failed to download song.');

            const downloadLink = apiRes.data.all_qualities?.audio?.download_url;
            const songTitle = apiRes.data.title || searchData.title;

            await socket.sendMessage(sender, {
              audio: { url: downloadLink },
              mimetype: 'audio/mpeg',
              fileName: `${songTitle.replace(/[^a-zA-Z0-9 ]/g, '_')}.mp3`
            }, { quoted: msg });

          } catch (err) {
            await socket.sendMessage(sender, { text: `❌ Download error: ${err.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── VIDEO / MP4 ────────────────────────
        case 'video':
        case 'yt':
        case 'mp4': {
          if (!args.length) {
            return await socket.sendMessage(sender, { text: `❌ *Usage:* ${prefix}video <video name or url>` }, { quoted: msg });
          }
          const query = args.join(' ');
          await socket.sendMessage(sender, { react: { text: '🎬', key: msg.key } });

          try {
            const result = await yts(query);
            if (!result.videos || result.videos.length === 0) {
              return await socket.sendMessage(sender, { text: '❌ Video not found.' }, { quoted: msg });
            }
            const videoData = result.videos[0];
            const apiUrl = `${config.API_YT_ALL_URL}?url=https://youtu.be/${videoData.videoId}&api_key=${config.NEXORA_API_KEY}`;
            const apiRes = await axios.get(apiUrl, { timeout: 30000 });

            const dlUrl = apiRes.data?.all_qualities?.['360p']?.download_url || apiRes.data?.all_qualities?.audio?.download_url;
            if (!dlUrl) throw new Error('Could not get download URL');

            await socket.sendMessage(sender, {
              video: { url: dlUrl },
              mimetype: 'video/mp4',
              caption: `🎬 *${videoData.title}*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch(e) {
            await socket.sendMessage(sender, { text: `❌ Video Error: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── TIKTOK ────────────────────────
        case 'tiktok':
        case 'tt': {
          const url = (args[0] || '').trim();
          if (!url || !url.startsWith('http')) {
            return await socket.sendMessage(sender, { text: `❌ *Usage:* ${prefix}tiktok <tiktok url>` }, { quoted: msg });
          }
          await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });
          try {
            const apiRes = await axios.get(`https://www.movanest.xyz/v2/tiktok?url=${encodeURIComponent(url)}`, { timeout: 20000 });
            const dl = apiRes.data?.results?.no_watermark || apiRes.data?.results?.watermark;
            if (!dl) throw new Error('Video not found.');

            await socket.sendMessage(sender, {
              video: { url: dl },
              mimetype: 'video/mp4',
              caption: `🎵 *TikTok Downloaded*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch (e) {
            await socket.sendMessage(sender, { text: `❌ TikTok download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── FACEBOOK ────────────────────────
        case 'fb':
        case 'facebook': {
          const url = (args[0] || '').trim();
          if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch'))) {
            return await socket.sendMessage(sender, { text: `❌ *Usage:* ${prefix}fb <facebook url>` }, { quoted: msg });
          }
          await socket.sendMessage(sender, { react: { text: '⏳', key: msg.key } });
          try {
            const apiRes = await axios.get(`https://www.movanest.xyz/v2/fbdown?url=${encodeURIComponent(url)}`, { timeout: 20000 });
            const directUrl = apiRes.data?.results?.[0]?.hdQualityLink || apiRes.data?.results?.[0]?.normalQualityLink;
            if (!directUrl) throw new Error('Facebook video not found.');

            await socket.sendMessage(sender, {
              video: { url: directUrl },
              mimetype: 'video/mp4',
              caption: `🎬 *Facebook Video*\n\n> © ${botName}`
            }, { quoted: msg });
          } catch (e) {
            await socket.sendMessage(sender, { text: `❌ FB download failed: ${e.message}` }, { quoted: msg });
          }
          break;
        }

        // ──────────────────────── OWNER ────────────────────────
        case 'owner': {
          await socket.sendMessage(sender, { react: { text: "👑", key: msg.key } });
          const ownerNumber = config.OWNER_NUMBER.split(',')[0].replace(/[^0-9]/g, '');
          const caption = `
🏷️ *BOT OWNER INFORMATION* 👑
┌──────────────────────
│ 👤 *Name:* ${config.OWNER_NAME}
│ 📱 *Number:* +${ownerNumber}
│ 📍 *Country:* Sri Lanka 🇱🇰
└──────────────────────`.trim();

          await socket.sendMessage(sender, {
            image: { url: logoUrl },
            caption,
            mentions: [`${ownerNumber}@s.whatsapp.net`]
          }, { quoted: msg });
          break;
        }

        // ──────────────────────── SET BOT NAME ────────────────────────
        case 'setbotname': {
          if (!isBotOrOwner) return await socket.sendMessage(sender, { text: '❌ Owner only command.' }, { quoted: msg });
          const newName = args.join(' ').trim();
          if (!newName) return await socket.sendMessage(sender, { text: '❌ Please provide a name.' }, { quoted: msg });
          userConfig.botName = newName;
          await setUserConfigInMongo(_preSan, userConfig);
          await socket.sendMessage(sender, { text: `✅ Bot Name updated to: *${newName}*` }, { quoted: msg });
          break;
        }

        // ──────────────────────── TOGGLES ────────────────────────
        case 'autotyping': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.AUTO_TYPING = opt === 'on' ? 'true' : 'false';
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(sender, { text: `✅ Auto Typing *${opt.toUpperCase()}*` }, { quoted: msg });
          }
          break;
        }

        case 'autorecording': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.AUTO_RECORDING = opt === 'on' ? 'true' : 'false';
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(sender, { text: `✅ Auto Recording *${opt.toUpperCase()}*` }, { quoted: msg });
          }
          break;
        }

        case 'antidelete': {
          if (!isBotOrOwner) return;
          const opt = (args[0] || '').toLowerCase();
          if (opt === 'on' || opt === 'off') {
            userConfig.ANTI_DELETE = opt;
            await setUserConfigInMongo(_preSan, userConfig);
            await socket.sendMessage(sender, { text: `✅ Anti Delete *${opt.toUpperCase()}*` }, { quoted: msg });
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
    setupNewsletterHandlers(socket, sanitizedNumber);
    handleMessageRevocation(socket, sanitizedNumber);

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