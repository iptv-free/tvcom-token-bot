import express from 'express';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import cron from 'node-cron';

const app = express();
const PORT = process.env.PORT || 3000;

let tokenCache = new Map();
let lastUpdate = null;

// 🎯 TOKENNI OLISH (LOGIN BILAN)
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
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    
    // 🔐 LOGIN QILISH (Agar phone/password bo'lsa)
    const phone = process.env.TVCOM_PHONE;
    const password = process.env.TVCOM_PASSWORD;
    
    if (phone && password) {
      console.log('🔐 Login qilinmoqda...');
      
      try {
        // Login sahifasiga o'tish
        await page.goto('https://tvcom.uz/login', { 
          waitUntil: 'networkidle0', 
          timeout: 60000 
        });
        
        await page.waitForTimeout(2000);
        
        // Telefon raqamni kiritish
        const phoneInput = await page.$('input[type="tel"], input[name="phone"], input[placeholder*="telefon"]');
        if (phoneInput) {
          await phoneInput.type(phone);
          console.log('📱 Telefon kiritildi');
        }
        
        // Parolni kiritish
        const passInput = await page.$('input[type="password"]');
        if (passInput) {
          await passInput.type(password);
          console.log('🔑 Parol kiritildi');
        }
        
        // Submit tugmasini bosish
        const submitBtn = await page.$('button[type="submit"], button:contains("Kirish"), .login-button');
        if (submitBtn) {
          await submitBtn.click();
          console.log('✅ Login tugmasi bosildi');
        }
        
        // Login natijasini kutish
        await page.waitForTimeout(5000);
        
        // Muvaffaqiyatli login bo'lganini tekshirish
        const currentUrl = page.url();
        console.log('📍 Hozirgi URL:', currentUrl);
        
      } catch (loginError) {
        console.error('⚠️ Login jarayonida xatolik:', loginError.message);
        // Login xato bo'lsa ham davom etamiz (ba'zi kanallar ochiq)
      }
    }
    
    // Kanal sahifasiga o'tish
    console.log('📺 Kanal sahifasiga o\'tilmoqda...');
    await page.goto(`https://tvcom.uz/channel/${channelId}`, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    // Tokenni olish
    const token = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      
      const patterns = [
        /token=([a-f0-9]{32})/,
        /"token"\s*:\s*"([a-f0-9]{32})"/,
        /'token'\s*:\s*'([a-f0-9]{32})'/,
        /tracks-[a-z0-9]+\/[a-z0-9]+\.m3u8\?token=([a-f0-9]{32})/,
        /data-token=["']([a-f0-9]{32})["']/
      ];
      
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          console.log('Pattern matched:', pattern.toString());
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
    }
    
    throw new Error('Token topilmadi');

  } catch (error) {
    console.error('❌ Xatolik:', error.message);
    if (browser) await browser.close();
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
  res.json({ 
    status: 'online', 
    lastUpdate, 
    cacheSize: tokenCache.size,
    message: 'Token bot (login bilan)'
  });
});

app.get('/api/token', async (req, res) => {
  try {
    const cached = tokenCache.get('default');
    
    // Cache dan qaytarish (30 daqiqa)
    if (cached && lastUpdate && (Date.now() - lastUpdate.getTime() < 1800000)) {
      console.log('📦 Cache dan qaytarildi');
      return res.json({ token: cached, fromCache: true, lastUpdate });
    }
    
    // Yangi token olish
    console.log('🔄 Yangi token olinmoqda...');
    const token = await fetchToken(req.query.id || '999');
    res.json({ token, fromCache: false, lastUpdate });
    
  } catch (error) {
    console.error('API Error:', error.message);
    const fallback = tokenCache.get('default');
    res.status(500).json({ 
      error: error.message, 
      fallback: fallback || null,
      note: fallback ? 'Eski token ishlatilmoqda' : 'Token umuman yo\'q'
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Bot started: port ${PORT}`);
  console.log(`📱 Login mavjud: ${!!process.env.TVCOM_PHONE}`);
  fetchToken('999').catch(console.error);
});
