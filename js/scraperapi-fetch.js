const createClient = require('scraperapi-sdk');

const usage = () => {
  console.log('Usage: node js/scraperapi-fetch.js <url> [--render] [--country=us] [--premium]');
  console.log('Env: SCRAPERAPI_KEY required');
};

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  usage();
  process.exit(1);
}

const key = process.env.SCRAPERAPI_KEY;
if (!key) {
  console.error('Missing SCRAPERAPI_KEY in environment.');
  process.exit(1);
}

const params = {};
for (const arg of args.filter((a) => a.startsWith('--'))) {
  if (arg === '--render') params.render = true;
  else if (arg === '--premium') params.premium = true;
  else if (arg.startsWith('--country=')) params.country_code = arg.split('=')[1];
  else if (arg.startsWith('--device=')) params.device_type = arg.split('=')[1];
}

const client = createClient(key);

(async () => {
  try {
    const result = await client.get(url, params);
    if (typeof result === 'string') {
      process.stdout.write(result);
      return;
    }
    if (result && result.text) {
      process.stdout.write(result.text);
      return;
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('ScraperAPI error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
