const { subtle } = require('crypto').webcrypto;

function pemToArrayBuffer(pem) {
  const b64Lines = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const b64 = atob(b64Lines);
  const buf = new Uint8Array(b64.length);
  for (let i = 0; i < b64.length; i++) {
    buf[i] = b64.charCodeAt(i);
  }
  return buf.buffer;
}

async function signJwt(clientEmail, privateKeyPem) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const payload = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp,
    iat
  };

  const encHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const data = new TextEncoder().encode(`${encHeader}.${encPayload}`);

  const privateKeyDer = pemToArrayBuffer(privateKeyPem);
  const key = await subtle.importKey(
    'pkcs8',
    privateKeyDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );

  const signature = await subtle.sign('RSASSA-PKCS1-v1_5', key, data);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${encHeader}.${encPayload}.${sigB64}`;
}

async function test() {
  const fs = require('fs');
  const env = fs.readFileSync('.env.local', 'utf8');
  let email = env.match(/GA_CLIENT_EMAIL="([^"]+)"/)[1];
  let pk = env.match(/GA_PRIVATE_KEY="([^"]+)"/)[1].replace(/\\n/g, '\n');

  const jwt = await signJwt(email, pk);
  console.log("JWT generated:", jwt.slice(0, 20) + "...");
  
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  console.log("Token response:", data);
}
test().catch(console.error);
