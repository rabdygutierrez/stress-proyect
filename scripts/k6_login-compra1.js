import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

const myTrend = new Trend('tiempo_respuesta');

// === CARGA DE USUARIOS ===
const users = new SharedArray('usuarios', () => {
  return JSON.parse(open('./users_10.json')).usuarios.slice(0, 5); // Solo 5 usuarios
});

// === CONFIGURACIÓN ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  const user = users[__VU % users.length];
  console.info(`🔐 Autenticando usuario: ${user.email}`);

  const authRes = http.post('https://appservicestest.harvestful.org/app-services-home/authenticate', JSON.stringify({
    email: user.email,
    password: user.password
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://portaltest.harvestful.org',
    },
  });

  check(authRes, {
    'auth status is 200': (r) => r.status === 200
  });

  const authData = authRes.json();
  const authToken = authData.result?.token;
  const jsessionid = authRes.headers['Set-Cookie']?.match(/JSESSIONID=([^;]+)/)?.[1];

  console.info(`✅ AUTH token: ${authToken}`);
  console.info(`🍪 JSESSIONID: ${jsessionid}`);

  const infoRes = http.post('https://appservicestest.harvestful.org/app-services-home/infoUser', JSON.stringify({
    token: authToken
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `JSESSIONID=${jsessionid}`,
      'Origin': 'https://portaltest.harvestful.org',
    },
  });

  check(infoRes, {
    'infoUser status is 200': (r) => r.status === 200
  });

  const infoData = infoRes.json();
  const userId = infoData.result?.user?.id;
  const customerId = infoData.result?.purchasedEvents?.[0]?.es?.[0]?.customer_id;
  console.info(`🧑‍💼 userId: ${userId} | customerId: ${customerId}`);

  const accessRes = http.post('https://appservicestest.harvestful.org/app-services-home/getUserAccessToken', JSON.stringify({
    email: user.email,
    customer_id: customerId
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://portaltest.harvestful.org',
      'Cookie': `JSESSIONID=${jsessionid}`,
    },
  });

  check(accessRes, {
    'getUserAccessToken status is 200': (r) => r.status === 200
  });

  const accessToken = accessRes.json().result?.token;
  console.info(`🎟️ EVENT ACCESS TOKEN: ${accessToken}`);

  const newSessionRes = http.post('https://appservicestest.harvestful.org/app-services-home/newSession', JSON.stringify({
    token: accessToken,
    customerId: customerId,
    userId: userId
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://portaltest.harvestful.org',
      'Cookie': `JSESSIONID=${jsessionid}`,
    },
  });

  check(newSessionRes, {
    'newSession status is 200': (r) => r.status === 200
  });

  sleep(1);
}
