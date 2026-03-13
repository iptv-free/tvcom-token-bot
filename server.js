import express from 'express';
import puppeteer from 'puppeteer';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 3000;

// 🔑 Tokenlarni saqlash (xotirada)
const tokenCache = new Map();
let lastUpdate = null;

// 🎯 TOKENNI AVTOMATIK OLISH (Puppeteer bilan)
async function fetchToken(channelId = '999') {
  let browser = null;
  
  try {
    console.log(`🔄 Token olinmoqda (kanal ${channelId})...`);
    
    // Puppeteer bilan haqiqiy brauzerni ochish
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    
    // Haqiqiy brauzerdek ko'rinish
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Saytga kirish
    await page.goto(`https://tvcom.uz/channel/${channelId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    // Sahifa yuklanishini kutish
    await page.waitForTimeout(3000);

    // Tokenni JavaScript orqali olish
    const token = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      
      // Bir nechta variantni qidirish
      const patterns = [
        /token=([a-f0-9]{32})/,
        /"token"\s*:\s*"([a-f0-9]{32})"/,
        /tracks-[a-z0-9]+\/[a-z0-9]+\.m3u8\?token=([a-f0-9]{32})/
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }
      
      return null;
    });

    await browser.close();
    
    if (token) {
      console.log(`✅ Token topildi: ${token.substring(0, 10)}...`);
      tokenCache.set('default', token);
      lastUpdate = new Date();
      return token;
    } else {
      throw new Error('Token topilmadi');
    }

  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// ⏰ CRON JOB: Har 30 daqiqada avtomatik yangilash
cron.schedule('*/30 * * * *', async () => {
  console.log('⏰ Avtomatik token yangilanishi boshlandi...');
  try {
    await fetchToken('999');
    console.log('✅ Token muvaffaqiyatli yangilandi!');
  } catch (error) {
    console.error('❌ Token yangilanishida xatolik:', error.message);
  }
});

// 🌐 API ENDPOINTS

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    lastUpdate: lastUpdate,
    cacheSize: tokenCache.size
  });
});

// Yangi token olish
app.get('/api/token', async (req, res) => {
  try {
    const channelId = req.query.id || '999';
    
    // Cache dan tekshirish (5 daqiqa ichida yangilangan bo'lsa)
    const cached = tokenCache.get('default');
    if (cached && lastUpdate && (Date.now() - lastUpdate.getTime() < 300000)) {
      console.log('📦 Cache dan token qaytarildi');
      return res.json({
        token: cached,
        fromCache: true,
        lastUpdate: lastUpdate
      });
    }
    
    // Yangi token olish
    const token = await fetchToken(channelId);
    res.json({
      token: token,
      fromCache: false,
      lastUpdate: lastUpdate
    });
    
  } catch (error) {
    res.status(500).json({
      error: error.message,
      fallback: tokenCache.get('default') || null
    });
  }
});

// Barcha kanallar uchun token
app.get('/api/tokens', async (req, res) => {
  try {
    const channels = req.query.channels ? req.query.channels.split(',') : ['999', '1', '15', '17'];
    const tokens = {};
    
    for (const channelId of channels) {
      try {
        tokens[channelId] = await fetchToken(channelId);
        await new Promise(r => setTimeout(r, 1000)); // Rate limiting
      } catch (e) {
        tokens[channelId] = null;
      }
    }
    
    res.json({ tokens, lastUpdate });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Server ishga tushirish
app.listen(PORT, () => {
  console.log(`🚀 Token Bot ishga tushdi: http://localhost:${PORT}`);
  // Birinchi token darhol olinadi
  fetchToken('999').catch(console.error);
});
