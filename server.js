// 🌐 PROXY SOZLAMALARI
const PROXY_CONFIG = {
  host: process.env.PROXY_HOST,      // proxy.deco.do
  port: process.env.PROXY_PORT,      // 8000
  username: process.env.PROXY_USER,  // Decodo username
  password: process.env.PROXY_PASS,  // Decodo password
};

async function fetchToken(channelId = '999') {
  let browser = null;
  
  try {
    console.log(`🔄 Token olinmoqda (kanal ${channelId})...`);
    
    // Proxy bilan ishga tushirish
    const proxyURL = `http://${PROXY_CONFIG.username}:${PROXY_CONFIG.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    
    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        `--proxy-server=${proxyURL}`,
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setDefaultNavigationTimeout(60000);
    
    // Kanal sahifasiga o'tish
    await page.goto(`https://tvcom.uz/channel/${channelId}`, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });

    await page.waitForTimeout(5000);

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
