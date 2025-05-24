const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();
const PORT = 3100;

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || 'AIzaSyCkHLdlBbIAf06GRiK7h2pfJkAc1P2FyFM');

app.use(express.json());

// Store QR code
let qrCodeData = '';
let qrCodeImage = '';

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// QR Code route
app.get('/qrcode', (req, res) => {
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

// ✅ عند مسح رمز QR بنجاح
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

// ✅ عند تسجيل الدخول
client.on('ready', () => {
    console.log('✅ البوت جاهز للعمل!');
});

// 📩 استقبال الرسائل ومعالجتها
client.on('message', async message => {
    console.log(`📩 رسالة مستلمة: ${message.body}`);

    if (message.body.toLowerCase() === 'start') {
        await client.sendMessage(message.from, '🎉 مرحبا! أنا دكستر، مساعدك الذكي. تم تدريبي بواسطة إبراهيم.\n\nيمكنك التحدث معي بأي لغة أو لهجة، وسأرد عليك بنفس الطريقة. يمكنك إرسال رسائل نصية، صور، أو رسائل صوتية.');
        return;
    }

    try {
        // الحصول على المحادثة
        const chat = await message.getChat();
        
        // تحديث سجل المحادثة
        if (!chatHistory.has(chat.id._serialized)) {
            chatHistory.set(chat.id._serialized, []);
        }
        
        // جلب آخر 40 رسالة
        const messages = await chat.fetchMessages({ limit: 40 });
        chatHistory.set(chat.id._serialized, messages);

        let userInput = message.body;
        let hasMedia = false;
        let detectedLanguage = 'ar'; // Default to Arabic

        // التحقق من وجود رد
        if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            userInput = `الرسالة السابقة: ${quotedMsg.body}\n\nالرد الحالي: ${message.body}`;
        }

        // التحقق من وجود وسائط
        if (message.hasMedia) {
            hasMedia = true;
            const media = await message.downloadMedia();
            
            if (message.type === 'image') {
                // إظهار مؤشر الكتابة
                await chat.sendStateTyping();
                
                // تحليل الصورة باستخدام Gemini
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
                // إظهار مؤشر الكتابة
                await chat.sendStateTyping();
                
                // تحويل الصوت إلى نص باستخدام Google Speech-to-Text
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
            // إظهار مؤشر الكتابة
            await chat.sendStateTyping();
        }

        // إضافة سياق المحادثة
        const conversationContext = chatHistory.get(chat.id._serialized)
            .slice(-5) // أخذ آخر 5 رسائل للسياق
            .map(msg => `${msg.fromMe ? 'دكستر' : 'المستخدم'}: ${msg.body}`)
            .join('\n');

        // استخدام Google AI للحصول على إجابة
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const prompt = `أنت دكستر، مساعد ذكي تم تدريبه بواسطة إبراهيم. قم بالرد على الرسالة التالية بشكل مفيد ومهذب. استخدم نفس لغة ولهجة الشخص الذي يتحدث معك.

سياق المحادثة السابق:
${conversationContext}

الرسالة الحالية: ${userInput}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const aiResponse = response.text();

        // إيقاف مؤشر الكتابة
        await chat.clearState();

        // إرسال الرد
        await client.sendMessage(message.from, aiResponse);

    } catch (error) {
        console.error('❌ خطأ:', error);
        // إيقاف مؤشر الكتابة في حالة الخطأ
        const chat = await message.getChat();
        await chat.clearState();
        await client.sendMessage(message.from, '❌ عذراً، حدث خطأ أثناء معالجة رسالتك. حاول مرة أخرى لاحقاً.');
    }
});

// ✅ إعادة تشغيل العميل عند الانفصال
client.on('disconnected', (reason) => {
    console.error('❌ تم فصل الاتصال:', reason);
    console.log('🔄 إعادة تشغيل البوت...');
    client.initialize();
});

app.listen(PORT, () => {
    console.log(`🚀 البوت يعمل على http://localhost:${PORT}`);
});

client.initialize();
