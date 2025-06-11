import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Métricas
const authenticateDuration = new Trend('authenticate_duration');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');

export const options = {
  stages: [{ duration: '30s', target: 1 }],
};

export default function () {
  // --- authenticate ---
  const authPayload = JSON.stringify({
    email: 'v01100@mailinator.com',
    password: 'Test123**',
  });

  let authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    authPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  authenticateDuration.add(authRes.timings.duration);

  check(authRes, {
    'authenticate status 200': (r) => r.status === 200,
    'authenticate token exists': (r) => !!r.json('result.token'),
  });

  const token = authRes.json('result.token');
  const privateIP = authRes.json('result.privateIP');

  const setCookieHeader = authRes.headers['Set-Cookie'] || '';
  const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+);/);
  const jsessionId = jsessionMatch ? jsessionMatch[1] : null;

  if (!token || !jsessionId) {
    console.error('❌ No se obtuvo token o JSESSIONID, abortando...');
    return;
  }

  console.log(`✅ Token: ${token}`);
  console.log(`🌐 Private IP: ${privateIP}`);
  console.log(`🍪 JSESSIONID: ${jsessionId}`);
  sleep(1);

  // --- infoUser ---
  const infoPayload = JSON.stringify({ token });

  let infoRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/infoUser',
    infoPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
      },
    }
  );
  infoUserDuration.add(infoRes.timings.duration);

  check(infoRes, {
    'infoUser status 200': (r) => r.status === 200,
  });

  if (infoRes.status !== 200) {
    console.error(`❌ infoUser falló con status ${infoRes.status}`);
    return;
  }

  const infoBody = infoRes.json();
  const customerId = infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;

  if (!customerId || !userId) {
    console.error('❌ No se encontró customer_id o userId en infoUser');
    return;
  }

  console.log(`🆔 Customer ID: ${customerId}`);
  console.log(`👤 User ID: ${userId}`);
  sleep(1);

  // --- getUserAccessToken ---
  const accessTokenPayload = JSON.stringify({
    email: 'v01100@mailinator.com',
    customer_id: customerId,
  });

  let accessTokenRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
    accessTokenPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  getUserAccessTokenDuration.add(accessTokenRes.timings.duration);

  check(accessTokenRes, {
    'getUserAccessToken status 200': (r) => r.status === 200,
  });

  if (accessTokenRes.status !== 200) {
    console.error(`❌ getUserAccessToken falló con status ${accessTokenRes.status}`);
    return;
  }

  console.log('🔑 getUserAccessToken exitoso');
  sleep(1);
  console.log('accessTokenRes');
  console.log(accessTokenRes);

  console.log('xxxxx',JSON.stringify(accessTokenRes));
  
  //---------------------------------------------------------------
  const user_access_token = accessTokenRes.result?.user_access_token || null;
  console.log('user_access_token');  
  console.log(user_access_token);

  // --- liveSession ---
  const livePayload = JSON.stringify({
    token:user_access_token,

  });
 console.log(livePayload);
  let liveRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/auth',
    livePayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  liveSessionDuration.add(liveRes.timings.duration);

  check(liveRes, {
    'liveSession status 200': (r) => r.status === 200,
  });
  console.log('liveRes');
  console.log(liveRes);
  if (liveRes.status !== 200) {
    console.error(`❌ liveSession falló con status ${liveRes.status}`);
    return;
  }
  console.log('🎥 liveSession exitoso');
  console.log(`📦 Payload liveSession: ${livePayload}`);
  sleep(1);

  // --- newSession ---
  const newSessionPayload = JSON.stringify({
    token:user_access_token,
    customer_id: customerId,
    user_id: userId,
  });

  let newSessionRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/newSession',
    newSessionPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  newSessionDuration.add(newSessionRes.timings.duration);

  check(newSessionRes, {
    'newSession status 200': (r) => r.status === 200,
  });

  if (newSessionRes.status !== 200) {
    console.error(`❌ newSession falló con status ${newSessionRes.status}`);
    return;
  }

  console.log('🆕 newSession exitoso');
  sleep(1);
}
