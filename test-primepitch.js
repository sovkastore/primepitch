const https = require('https');

https.get('https://primepitch.daxonicstudios.workers.dev/api/matches?sport=football', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const matches = JSON.parse(data);
      const tottenham = matches.filter(m => m.title && m.title.toLowerCase().includes('tottenham'));
      console.log('Football matches:', matches.length);
      console.log(JSON.stringify(tottenham, null, 2));
    } catch (e) {
      console.error('Parse error:', e, data.substring(0, 100));
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err);
});
