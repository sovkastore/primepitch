const fetch = require('node-fetch');
async function run() {
  const res = await fetch('https://football-live-streaming-api.p.rapidapi.com/matches?page=1', {
    headers: {
      'x-rapidapi-host': 'football-live-streaming-api.p.rapidapi.com',
      'x-rapidapi-key': process.env.RAPID_API_KEY
    }
  });
  console.log(res.status);
  const data = await res.json();
  console.log(JSON.stringify(data).substring(0, 500));
}
run();
