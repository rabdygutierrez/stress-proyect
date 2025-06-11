import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

// Métricas
const authenticateDuration = new Trend('authenticate_duration');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const assiedPurchaseDuration = new Trend('assiedPurchase_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');

export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  // --- authenticate ---
  const authPayload = JSON.stringify({
    email: 'v1901@mailinator.com',
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

  if (!token) {
    console.error('❌ No token obtenido en authenticate, abortando...');
    return;
  }
  console.log(`✅ Token: ${token}`);
  console.log(`🌐 Private IP: ${privateIP}`);

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
  const customerId =
    infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;

  if (!customerId) {
    console.error('❌ No se encontró customer_id en infoUser');
    return;
  }
  console.log(`🆔 Customer ID: ${customerId}`);

  sleep(1);
// --- getUserAccessToken ---
  const accessTokenPayload = JSON.stringify({ token, customer_id: customerId });

  let accessTokenRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
    accessTokenPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
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

 

}
