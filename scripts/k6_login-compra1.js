import http from 'k6/http';
import { check, sleep } from 'k6';

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // 1. Authenticate
  const authPayload = JSON.stringify({
    email: 'rogerxyz@mailinator.com',
    password: 'Test123**',
  });

  console.log('\n[Authenticate] Request to authenticate');
  console.log(`Payload: ${authPayload}`);

  const authRes = http.post('https://apptest.harvestful.org/authenticate', authPayload, { headers });

  console.log(`Status: ${authRes.status}`);
  console.log(`Response body: ${authRes.body}`);

  check(authRes, {
    'auth status is 200': (r) => r.status === 200,
  });

  if (authRes.status !== 200) return;

  const token = JSON.parse(authRes.body).token;
  const customerId = JSON.parse(authRes.body).customer_id || 671; // Ajustá si viene del token o hardcodea

  // 2. InfoUser
  const infoUserPayload = JSON.stringify({ token });

  console.log('\n[InfoUser] Request to infoUser');
  console.log(`Payload: ${infoUserPayload}`);

  const infoUserRes = http.post('https://apptest.harvestful.org/infoUser', infoUserPayload, { headers });

  console.log(`Status: ${infoUserRes.status}`);
  console.log(`Response body: ${infoUserRes.body}`);

  check(infoUserRes, {
    'infoUser status is 200': (r) => r.status === 200,
  });

  if (infoUserRes.status !== 200) return;

  // 3. GetUserAccessToken
  const getUserAccessTokenPayload = JSON.stringify({
    token,
    customerId,
    email: 'rogerxyz@mailinator.com',
  });

  console.log('\n[GetUserAccessToken] Request to getUserAccessToken');
  console.log(`Payload: ${getUserAccessTokenPayload}`);

  const getUserAccessTokenRes = http.post('https://apptest.harvestful.org/getUserAccessToken', getUserAccessTokenPayload, { headers });

  console.log(`Status: ${getUserAccessTokenRes.status}`);
  console.log(`Response body: ${getUserAccessTokenRes.body}`);

  check(getUserAccessTokenRes, {
    'getUserAccessToken status is 200': (r) => r.status === 200,
  });

  if (getUserAccessTokenRes.status !== 200) return;

  // 4. Auth LIVE (auth for LIVE module)
  const authLivePayload = JSON.stringify({
    token,
  });

  console.log('\n[Auth LIVE] Request to auth LIVE');
  console.log(`Payload: ${authLivePayload}`);

  const authLiveRes = http.post('https://apptest.harvestful.org/auth', authLivePayload, { headers });

  console.log(`Status: ${authLiveRes.status}`);
  console.log(`Response body: ${authLiveRes.body}`);

  check(authLiveRes, {
    'auth LIVE status is 200': (r) => r.status === 200,
  });

  if (authLiveRes.status !== 200) return;

  // 5. New Session
  const newSessionPayload = JSON.stringify({
    token,
  });

  console.log('\n[NewSession] Request to newSession');
  console.log(`Payload: ${newSessionPayload}`);

  const newSessionRes = http.post('https://apptest.harvestful.org/newSession', newSessionPayload, { headers });

  console.log(`Status: ${newSessionRes.status}`);
  console.log(`Response body: ${newSessionRes.body}`);

  check(newSessionRes, {
    'newSession status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
