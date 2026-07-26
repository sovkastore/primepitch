const https = require('https');

https.get('https://streamed.pk/api/matches/football', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    try {
      const matches = JSON.parse(data);
      const tottenham = matches.filter(m => m.title && m.title.toLowerCase().includes('tottenham'));
      console.log(JSON.stringify(tottenham, null, 2));
    } catch (e) {
      console.error('Parse error:', e);
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err);
});
