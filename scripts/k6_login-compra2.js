import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Métricas
const authenticateDuration = new Trend('authenticate_duration');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');

const requestCount = new Counter('request_count');
const errorCount = new Counter('error_count');

export const options = {
  stages: [{ duration: '30s', target: 1 }],
};

function recordMetrics(trend, res, urlName) {
  trend.add(res.timings.duration, { url: urlName, status: res.status });
  requestCount.add(1, { url: urlName, status: res.status });
  if (res.status >= 400) {
    errorCount.add(1, { url: urlName, status: res.status });
  }
}

export default function () {
  // authenticate
  const authPayload = JSON.stringify({
    email: 'rabdy@yopmail.com',
    password: 'Test123**',
  });

  let authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    authPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  recordMetrics(authenticateDuration, authRes, 'authenticate');

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
    return;
  }

  sleep(1);

  // infoUser
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
  recordMetrics(infoUserDuration, infoRes, 'infoUser');

  check(infoRes, {
    'infoUser status 200': (r) => r.status === 200,
  });

  if (infoRes.status !== 200) return;

  const infoBody = infoRes.json();
  const customerId = infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;

  if (!customerId || !userId) {
    return;
  }

  sleep(1);

  // getUserAccessToken
  const accessTokenPayload = JSON.stringify({
    email: 'rabdy@yopmail.com',
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
        Cookie: `JSESSIONID=${jsessionId}`,
      },
    }
  );
  recordMetrics(getUserAccessTokenDuration, accessTokenRes, 'getUserAccessToken');

  check(accessTokenRes, {
    'getUserAccessToken status 200': (r) => r.status === 200,
    'getUserAccessToken token exists': (r) => !!r.json('result.user_access_token'),
  });

  if (accessTokenRes.status !== 200) return;

  sleep(1);

  const user_access_token = accessTokenRes.json('result.user_access_token');

  // liveSession
  const livePayload = JSON.stringify({ token: user_access_token });

  let liveRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/auth',
    livePayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Private-IP': privateIP,
        Cookie: `JSESSIONID=${jsessionId}`,
      },
    }
  );
  recordMetrics(liveSessionDuration, liveRes, 'liveSession');

  check(liveRes, {
    'liveSession status 200': (r) => r.status === 200,
  });

  if (liveRes.status !== 200) return;

  sleep(1);

  // newSession
  const newSessionPayload = JSON.stringify({
    token: user_access_token,
    customerId: customerId,
    userId: userId,
  });

  let newSessionRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
    newSessionPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Private-IP': privateIP,
        Cookie: `JSESSIONID=${jsessionId}`,
      },
    }
  );
  recordMetrics(newSessionDuration, newSessionRes, 'newSession');

  check(newSessionRes, {
    'newSession status 200': (r) => r.status === 200,
  });

  if (newSessionRes.status !== 200) return;

  sleep(1);
}
