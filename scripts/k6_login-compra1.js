import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { open } from 'k6/fs';

// Usuarios
const users = new SharedArray('usuarios', () => {
  return JSON.parse(open('./users_10.json')).usuarios.slice(0, 5);
});

// Métricas personalizadas
const authenticateTrend = new Trend('time_authenticate');
const authenticateSuccess = new Rate('success_authenticate');

const infoUserTrend = new Trend('time_infoUser');
const infoUserSuccess = new Rate('success_infoUser');

const getUserAccessTokenTrend = new Trend('time_getUserAccessToken');
const getUserAccessTokenSuccess = new Rate('success_getUserAccessToken');

const liveAuthTrend = new Trend('time_liveAuth');
const liveAuthSuccess = new Rate('success_liveAuth');

const newSessionTrend = new Trend('time_newSession');
const newSessionSuccess = new Rate('success_newSession');

export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  const user = users[__VU - 1];
  const email = user.email;
  const password = user.password;

  const commonHeadersPortal = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'origin': 'https://portaltest.harvestful.org',
    'referer': 'https://portaltest.harvestful.org/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  };

  // Authenticate
  let start = Date.now();
  let res = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    JSON.stringify({ email, password }),
    { headers: commonHeadersPortal }
  );
  authenticateTrend.add(Date.now() - start);
  const authOk = check(res, {
    'authenticate status 200': (r) => r.status === 200,
    'authenticate has token': (r) => !!r.json('result.token'),
  });
  authenticateSuccess.add(authOk);
  if (!authOk) {
    console.error(`Authenticate failed for user ${email}: ${res.body}`);
    fail('Authenticate step failed');
  }

  const authToken = res.json('result.token');
  const setCookie = res.headers['Set-Cookie'] || '';
  const jsessionIdMatch = setCookie.match(/JSESSIONID=([^;]+);/);
  if (!jsessionIdMatch) {
    console.error(`No JSESSIONID cookie for user ${email}`);
    fail('Missing JSESSIONID');
  }
  const jsessionId = jsessionIdMatch[1];

  // infoUser
  start = Date.now();
  res = http.post(
    'https://appservicestest.harvestful.org/app-services-home/infoUser',
    JSON.stringify({ token: authToken }),
    { headers: { ...commonHeadersPortal, Cookie: `JSESSIONID=${jsessionId}` } }
  );
  infoUserTrend.add(Date.now() - start);
  const infoOk = check(res, {
    'infoUser status 200': (r) => r.status === 200,
    'infoUser has customerId': (r) => !!r.json('result.customerId'),
    'infoUser has userId': (r) => !!r.json('result.userId'),
  });
  infoUserSuccess.add(infoOk);
  if (!infoOk) {
    console.error(`infoUser failed for user ${email}: ${res.body}`);
    fail('infoUser step failed');
  }

  const customerId = res.json('result.customerId');
  const userId = res.json('result.userId');

  // getUserAccessToken
  start = Date.now();
  res = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
    JSON.stringify({ email, customer_id: customerId }),
    { headers: { ...commonHeadersPortal, Cookie: `JSESSIONID=${jsessionId}` } }
  );
  getUserAccessTokenTrend.add(Date.now() - start);
  const tokenOk = check(res, {
    'getUserAccessToken status 200': (r) => r.status === 200,
    'getUserAccessToken has accessToken': (r) => !!r.json('result.accessToken'),
  });
  getUserAccessTokenSuccess.add(tokenOk);
  if (!tokenOk) {
    console.error(`getUserAccessToken failed for user ${email}: ${res.body}`);
    fail('getUserAccessToken step failed');
  }

  const accessToken = res.json('result.accessToken');

  // Live auth
  const commonHeadersLive = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'origin': 'https://livetest.harvestful.org',
    'referer': 'https://livetest.harvestful.org/',
    'user-agent': commonHeadersPortal['user-agent'],
    Cookie: `JSESSIONID=${jsessionId}`,
  };

  start = Date.now();
  res = http.post(
    'https://appservicestest.harvestful.org/app-services-live/auth',
    JSON.stringify({ token: authToken }),
    { headers: commonHeadersLive }
  );
  liveAuthTrend.add(Date.now() - start);
  const liveOk = check(res, {
    'live auth status 200': (r) => r.status === 200,
    'live auth has eventAccessToken': (r) => !!r.json('eventAccessToken'),
  });
  liveAuthSuccess.add(liveOk);
  if (!liveOk) {
    console.error(`Live auth failed for user ${email}: ${res.body}`);
    fail('live auth step failed');
  }

  const eventAccessToken = res.json('eventAccessToken');

  // newSession
  const newSessionPayload = {
    token: eventAccessToken,
    customerId,
    userId,
    accessToken,
  };

  start = Date.now();
  res = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
    JSON.stringify(newSessionPayload),
    { headers: commonHeadersLive }
  );
  newSessionTrend.add(Date.now() - start);
  const newSessionOk = check(res, {
    'newSession status 200': (r) => r.status === 200,
  });
  newSessionSuccess.add(newSessionOk);
  if (!newSessionOk) {
    console.error(`newSession failed for user ${email}: ${res.body}`);
    fail('newSession step failed');
  }

  sleep(1);
}
