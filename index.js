const fs = require('fs');
const path = require('path');
const walmart = require('./stores/walmart');
const target = require('./stores/target');
const sams = require('./stores/sams');
const { todayStamp } = require('./core/cache');

const PRODUCTS_PATH = path.join(process.cwd(), 'data', 'products.json');
const DATA_DIR = path.join(process.cwd(), 'data');

const readProducts = () => {
  if (!fs.existsSync(PRODUCTS_PATH)) {
    throw new Error('Missing data/products.json');
  }
  return JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

async function run() {
  const products = readProducts();
  const results = [];
  const bootstrapOnly = process.argv.includes('--bootstrap');

  if (bootstrapOnly) {
    console.log('Bootstrap mode enabled.');
  }

  if (bootstrapOnly) {
    const walmartSession = await require('./core/sessionManager').getSession({
      name: 'Walmart',
      homepageUrl: 'https://www.walmart.com/',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
      },
      logSummary: true
    });
    const targetSession = await require('./core/sessionManager').getSession({
      name: 'Target',
      homepageUrl: 'https://www.target.com/',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
      },
      logSummary: true
    });
    const samsSession = await require('./core/sessionManager').getSession({
      name: 'Sams',
      homepageUrl: 'https://www.samsclub.com/',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'upgrade-insecure-requests': '1'
      },
      logSummary: true
    });

    [walmartSession, targetSession, samsSession].forEach((session, idx) => {
      const store = ['Walmart', 'Target', 'Sams'][idx];
      const captured = session.capturedRequests || [];
      const eligible = captured.filter((r) => !r.isDenied);
      console.log(`${store} captured: ${captured.length}`);
      console.log(`${store} eligible: ${eligible.length}`);
      const best = session.bestCandidate;
      if (!best || best.isDenied) {
        console.log(`${store}: bestCandidate = null`);
      } else {
        console.log(`${store} bestCandidate:`, best);
      }
    });
    return;
  }

  results.push(...await walmart.getDailyPrices(products));
  results.push(...await target.getDailyPrices(products));
  results.push(...await sams.getDailyPrices(products));

  const dailyPath = path.join(DATA_DIR, `${todayStamp()}-foods.json`);
  const latestPath = path.join(DATA_DIR, 'latest.json');
  writeJson(dailyPath, results);
  writeJson(latestPath, results);

  console.log(`Saved: ${dailyPath}`);
  console.log(`Updated: ${latestPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
