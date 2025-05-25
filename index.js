const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const chrome = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core');

let createMidjourney;
const app = express();
const PORT = process.env.PORT || 8080;

// إعداد Express لتحليل JSON
app.use(express.json());

// إعداد الليمتر
const rateLimiter = new RateLimiterMemory({
    points: 5, // عدد الرسائل المسموح بها
    duration: 10, // خلال 10 ثواني
});

// تهيئة Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || 'AIzaSyCkHLdlBbIAf06GRiK7h2pfJkAc1P2FyFM');

// تخزين رمز QR
let qrCodeData = '';
let qrCodeImage = '';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: chrome.executablePath,
        args: chrome.args,
        headless: chrome.headless
    }
});

// QR Code endpoint
app.get('/api/qrcode', (req, res) => {
    if (!qrCodeData || !qrCodeImage) {
        return res.send(`
            <html>
                <head>
                    <title>WhatsApp Bot QR Code</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
                        .container { text-align: center; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                        h1 { color: #128C7E; }
                        .loading { color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>WhatsApp Bot QR Code</h1>
                        <p class="loading">جاري تحميل رمز QR...</p>
                    </div>
                </body>
            </html>
        `);
    }
    res.send(`
        <html>
            <head>
                <title>WhatsApp Bot QR Code</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; }
                    .container { text-align: center; padding: 20px; background: white; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
                    h1 { color: #128C7E; }
                    img { margin-top: 20px; width: 300px; height: 300px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>WhatsApp Bot QR Code</h1>
                    <img src="${qrCodeImage}" alt="QR Code" />
                </div>
            </body>
        </html>
    `);
});

// تخزين سجل المحادثات
const chatHistory = new Map();

// عند مسح رمز QR بنجاح
client.on('qr', qr => {
    console.log('📌 قم بمسح رمز QR لتسجيل الدخول:');
    qrcode.generate(qr, { small: true });
    qrCodeData = qr;
    QRCode.toDataURL(qr, { width: 300 }, (err, url) => {
        if (!err) {
            qrCodeImage = url;
        }
    });
});

// عند تسجيل الدخول
client.on('ready', async () => {
    console.log('✅ البوت جاهز للعمل!');
    
    try {
        const chats = await client.getChats();
        for (const chat of chats) {
            const messages = await chat.fetchMessages({ limit: 100 });
            chatHistory.set(chat.id._serialized, messages);
        }
        console.log('📚 تم قراءة وتخزين الرسائل السابقة');
    } catch (error) {
        console.error('❌ خطأ في قراءة الرسائل السابقة:', error);
    }
});

// استقبال الرسائل ومعالجتها
client.on('message', async message => {
    try {
        // فحص الليميت
        const userId = message.from;
        await rateLimiter.consume(userId).catch(() => {
            throw new Error('🚫 يا معلم، أنت بعت رسايل كتير أوي! استنى شوية وجرب تاني.');
        });

        // إضافة أمر .ping
        if (message.body.toLowerCase() === '.ping') {
            const startTime = Date.now();
            const pingMessage = await message.reply('🏓 جاري حساب البنج...');
            const endTime = Date.now();
            const ping = endTime - startTime;
            
            await message.reply(`🏓 Pong!\n\n⏱️ البنج: ${ping}ms\n\n📝 اكتب .ping مرة أخرى لتحديث البنج`);
            return;
        }

        // معالجة أزرار التفاعل
        if (message.body === '🔄 تحديث') {
            const startTime = Date.now();
            const pingMessage = await message.reply('🏓 جاري حساب البنج...');
            const endTime = Date.now();
            const ping = endTime - startTime;
            
            const buttonMessage = {
                text: `🏓 Pong!\n\n⏱️ البنج: ${ping}ms\n\n🔄 اضغط على الزر ده عشان تحسب البنج تاني`,
                footer: 'Dexster Bot',
                buttons: [
                    {buttonId: 'ping', buttonText: {displayText: '🔄 تحديث'}, type: 1}
                ],
                headerType: 1
            };
            
            await client.sendMessage(message.from, buttonMessage);
            return;
        }

        // احصل على رقم البوت بصيغته الكاملة
        const botId = (await client.info.wid)._serialized;
        const botNumber = botId.split('@')[0]; // الرقم فقط
        const botMention = '@230511482011758'; // منشن البوت كنص ثابت

        if (message.from.includes('@g.us')) {
            const mentionedNumbers = Array.isArray(message.mentionedIds)
              ? message.mentionedIds.map(id => id.split('@')[0])
              : [];

            const mentioned = mentionedNumbers.includes(botNumber) || message.body.includes(botMention);

            let isReplyToBot = false;
            if (message.hasQuotedMsg) {
                const quotedMsg = await message.getQuotedMessage();
                if (quotedMsg.fromMe) {
                    isReplyToBot = true;
                }
            }

            if (!mentioned && !isReplyToBot) {
                return;
            }

            const senderId = message.author || message.from;
            const senderContact = await client.getContactById(senderId);
            const senderName = senderContact.pushname || senderContact.number || senderId;
            console.log(`المرسل: ${senderName}`);
        }
        console.log(`📩 رسالة مستلمة: ${message.body}`);

        if (message.body.toLowerCase() === 'start') {
            await client.sendMessage(message.from, '🎉 مرحبا! أنا دكستر، مساعدك الذكي. تم تدريبي بواسطة إبراهيم.\n\nيمكنك التحدث معي بأي لغة أو لهجة، وسأرد عليك بنفس الطريقة. يمكنك إرسال رسائل نصية، صور، أو رسائل صوتية.', { quotedMessageId: message.id._serialized });
            return;
        }

        let cleanBody = message.body.replace(/@\S+\s?/g, '').trim();

        const imagePromptPatterns = [
          /اعمل(?:ي)? صورة (.+)/i,
          /انشئ(?:ي)? صورة (.+)/i,
          /ارسم(?:ي)? صورة (.+)/i,
          /قم ب(?:انشاء|رسم) صورة (.+)/i,
          /صورة (.+)/i
        ];
        let imagePrompt = null;
        for (const pattern of imagePromptPatterns) {
          const match = cleanBody.match(pattern);
          if (match) {
            imagePrompt = match[1];
            break;
          }
        }
        if (imagePrompt) {
          await message.reply("⏳ جاري توليد الصورة، انتظر قليلاً ...", message);
          try {
            if (!createMidjourney) {
              ({ createMidjourney } = await import('replicate-fetch'));
            }
            let images = await createMidjourney({ prompt: imagePrompt });
            if (images && images[0]) {
              await message.reply("✅ تم توليد الصورة بناءً على طلبك!", message);
              await message.reply(new MessageMedia('image/png', images[0]), message);
            } else {
              await message.reply("لم أستطع توليد الصورة. جرب وصف آخر!", message);
            }
          } catch (err) {
            await message.reply("حدث خطأ أثناء توليد الصورة. حاول لاحقاً.", message);
          }
          return;
        }

        const chat = await message.getChat();
        const storedMessages = chatHistory.get(chat.id._serialized) || [];
        
        let userInput = cleanBody;
        let hasMedia = false;

        if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            userInput = `الرسالة السابقة: ${quotedMsg.body}\n\nالرد الحالي: ${cleanBody}`;
        }

        if (message.hasMedia) {
            hasMedia = true;
            const media = await message.downloadMedia();
            
            if (message.type === 'image') {
                await chat.sendStateTyping();
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                const result = await model.generateContent([
                    "أنت دكستر، مساعد ذكي تم تدريبه بواسطة إبراهيم. قم بتحليل هذه الصورة ووصفها بشكل مفصل. استخدم نفس لغة ولهجة الشخص الذي يتحدث معك.",
                    {
                        inlineData: {
                            mimeType: media.mimetype,
                            data: media.data
                        }
                    }
                ]);
                const response = await result.response;
                userInput = response.text();
            } else if (message.type === 'ptt' || message.type === 'audio') {
                await chat.sendStateTyping();
                try {
                    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                    const result = await model.generateContent([
                        "قم بتحويل هذا الصوت إلى نص. استخدم نفس لغة ولهجة المتحدث.",
                        {
                            inlineData: {
                                mimeType: media.mimetype,
                                data: media.data
                            }
                        }
                    ]);
                    const response = await result.response;
                    userInput = response.text();
                } catch (error) {
                    console.error('❌ خطأ في معالجة الصوت:', error);
                    userInput = "عذراً، لم أتمكن من فهم الرسالة الصوتية. هل يمكنك إعادة إرسالها أو كتابة رسالتك؟";
                }
            }
        }

        if (!hasMedia) {
            await chat.sendStateTyping();
        }

        const conversationContext = storedMessages
            .map(msg => msg.body)
            .join('\n');

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `أنت دكستر، مساعد ذكي تم تدريبه بواسطة إبراهيم. قم بالرد على الرسالة التالية بشكل مفيد ومهذب. استخدم نفس لغة ولهجة الشخص الذي يتحدث معك ولو حد شتمك اشتمو.\n\nسياق المحادثة السابق:\n${conversationContext}\n\nالرسالة: ${userInput}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();

        await chat.clearState();
        await client.sendMessage(message.from, aiResponse, { quotedMessageId: message.id._serialized });

    } catch (error) {
        console.error('❌ خطأ:', error);
        const chat = await message.getChat();
        await chat.clearState();
        await client.sendMessage(message.from, '❌ عذراً، حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى لاحقاً.', { quotedMessageId: message.id._serialized });
    }
});

// إعادة تشغيل العميل عند الانفصال
client.on('disconnected', (reason) => {
    console.error('❌ تم فصل الاتصال:', reason);
    console.log('🔄 إعادة تشغيل البوت...');
    client.initialize();
});

// تشغيل الخادم
app.listen(PORT, () => {
    console.log(`🚀 البوت يعمل على http://localhost:${PORT}`);
});

client.initialize();

// تصدير الدالة لـ Vercel
module.exports = app;
