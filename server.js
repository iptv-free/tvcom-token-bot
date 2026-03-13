import express from 'express';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 3000;

const tokenCache = new Map();
let lastUpdate = null;

// 🎯 TOKENNI OLISH (Yengil Chrome bilan)
async function fetchToken(channelId = '999') {
  let browser = null;
  
  try {
    console.log(`🔄 Token olinmoqda (kanal ${channelId})...`);
    
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.goto(`https://tvcom.uz/channel/${channelId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await page.waitForTimeout(2000);

    const token = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const patterns = [
        /token=([a-f0-9]{32})/,
        /"token"\s*:\s*"([a-f0-9]{32})"/,
        /tracks-[a-z0-9]+\/[a-z0-9]+\.m3u8\?token=([a-f0-9]{32})/
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) return match[1];
      }
      return null;
    });

    await browser.close();
     
    if (token) {
      console.log(`✅ Token topildi: ${token.substring(0, 10)}...`);
      tokenCache.set('default', token);
      lastUpdate = new Date();
      return token;
    }
    
    throw new Error('Token topilmadi');

  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    if (browser) await browser.close();
    throw error;
  }
}

// ⏰ CRON: Har 30 daqiqada avto-yangilanish
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
    res.status(500).json({ error: error.message, fallback: tokenCache.get('default') });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot started: port ${PORT}`);
  fetchToken('999').catch(console.error);
});
