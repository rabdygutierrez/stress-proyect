import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 5,
  duration: '1m',
};

const baseUrl = 'https://apptest.harvestful.org';

const users = [
  { email: 'rogerxyz@mailinator.com', password: 'Test123**', customerId: 671 },
  // agrega más usuarios si quieres
];

export default function () {
  const user = users[Math.floor(Math.random() * users.length)];

  console.info('\n[Authenticate] Request to authenticate');
  const authPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });
  console.info('Payload:', authPayload);

  let authRes = http.post(`${baseUrl}/authenticate`, authPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.info('Status:', authRes.status);
  check(authRes, { 'auth status is 200': (r) => r.status === 200 });

  if (authRes.status !== 200) return;

  const authResult = authRes.json();
  console.info('Response result keys:', Object.keys(authResult));

  const sessionToken = authResult.token;

  console.info('\n[InfoUser] Request to infoUser');
  const infoPayload = JSON.stringify({ token: sessionToken });
  console.info('Payload:', infoPayload);

  let infoRes = http.post(`${baseUrl}/infoUser`, infoPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.info('Status:', infoRes.status);
  check(infoRes, { 'infoUser status is 200': (r) => r.status === 200 });

  if (infoRes.status !== 200) return;

  const infoResult = infoRes.json();
  console.info('Response result keys:', Object.keys(infoResult));

  console.info('\n[GetUserAccessToken] Request to getUserAccessToken');
  const accessPayload = JSON.stringify({
    token: sessionToken,
    customer_id: user.customerId,  // CORREGIDO customer_id en snake_case
    email: user.email,
  });
  console.info('Payload:', accessPayload);

  let accessRes = http.post(`${baseUrl}/getUserAccessToken`, accessPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.info('Status:', accessRes.status);
  if (accessRes.status !== 200) {
    console.info('Response body (error):', accessRes.body);
    return;
  }

  const accessResult = accessRes.json();
  console.info('Response result keys:', Object.keys(accessResult));

  const userAccessToken = accessResult.userAccessToken;

  console.info('\n[NewSession] Request to newSession');
  const sessionPayload = JSON.stringify({
    token: userAccessToken,
    customer_id: user.customerId,  // CORREGIDO customer_id en snake_case
    userId: accessResult.userId,
  });
  console.info('Payload:', sessionPayload);

  let sessionRes = http.post(`${baseUrl}/newSession`, sessionPayload, {
    headers: { 'Content-Type': 'application/json' },
  });

  console.info('Status:', sessionRes.status);
  check(sessionRes, { 'newSession status is 200': (r) => r.status === 200 });

  if (sessionRes.status !== 200) {
    console.info('Response body (error):', sessionRes.body);
    return;
  }

  const sessionResult = sessionRes.json();
  console.info('Response result keys:', Object.keys(sessionResult));

  sleep(1);
}
