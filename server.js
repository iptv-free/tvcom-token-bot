import express from 'express';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 10000;

// 🎯 DECODO API CONFIG
const DECODO_API_KEY = process.env.DECODO_API_KEY;
const DECODO_API_URL = 'https://scraper-api.deco.do/v2/scrape';

let tokenCache = new Map();
let lastUpdate = null;

// 🎯 TOKENNI DECODO ORQALI OLISH
async function fetchToken(channelId = '999') {
  try {
    console.log(`🔄 Token olinmoqda (kanal ${channelId})...`);
    
    const response = await fetch(DECODO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `${DECODO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://tvcom.uz/channel/${channelId}`,
        proxy_pool: 'premium',
        javascript_rendering: true,
        output: 'raw',
        headless: 'html',
      }),
    });

    if (!response.ok) {
      throw new Error(`Decodo API xatosi: ${response.status}`);
    }

    const data = await response.json();
    const html = data.content || data.html || data.result;

    if (!html) {
      throw new Error('HTML qaytmadi');
    }

    // Tokenni qidirish
    const patterns = [
      /token=([a-f0-9]{32})/,
      /"token"\s*:\s*"([a-f0-9]{32})"/,
      /tracks-[a-z0-9]+\/[a-z0-9]+\.m3u8\?token=([a-f0-9]{32})/
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const token = match[1];
        console.log(`✅ Token topildi: ${token.substring(0, 10)}...`);
        tokenCache.set('default', token);
        lastUpdate = new Date();
        return token;
      }
    }

    throw new Error('Token HTML dan topilmadi');

  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    throw error;
  }
}

// ⏰ CRON: Har 30 daqiqada
cron.schedule('*/30 * * * *', async () => {
  console.log('⏰ Avtomatik yangilanish...');
  try {
    await fetchToken('999');
    console.log('✅ Yangilandi!');
  } catch (e) {
    console.error('❌ Xatolik:', e.message);
  }
});

// 🌐 API
app.get('/', (req, res) => {
  res.json({ status: 'online', lastUpdate, cacheSize: tokenCache.size });
});

app.get('/api/token', async (req, res) => {
  try {
    const cached = tokenCache.get('default');
    if (cached && lastUpdate && (Date.now() - lastUpdate.getTime() < 1800000)) {
      return res.json({ token: cached, fromCache: true, lastUpdate });
    }
    
    const token = await fetchToken(req.query.id || '999');
    res.json({ token, fromCache: false, lastUpdate });
    
  } catch (error) {
    const fallback = tokenCache.get('default');
    res.status(500).json({ error: error.message, fallback });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot started: port ${PORT}`);
  fetchToken('999').catch(console.error);
});
