import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 20 },
  ],
};

// Datos de usuarios cargados desde un JSON externo
const users = new SharedArray('usuarios', function () {
  return JSON.parse(open('./data/users.json'));
});

export default function () {
  const user = users[__VU % users.length]; // distribuye usuarios
  let payload, res;

  // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  group('::Authenticate User', function () {
    payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    res = http.post('https://appservicestest.harvestful.org/app-services-authenticate', payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    logResponse('Authenticate', res);

    check(res, {
      'Authenticate status is 200': (r) => r.status === 200,
    });

    if (res.status !== 200) return;
  });

  // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  group('::Info User Request', function () {
    res = http.post('https://appservicestest.harvestful.org/app-services-infoUser', null, {
      headers: { 'Authorization': `Bearer ${JSON.parse(res.body).accessToken}` },
    });

    logResponse('InfoUser', res);

    check(res, {
      'InfoUser status is 200': (r) => r.status === 200,
    });

    if (res.status !== 200) return;
  });

  // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  group('::Get User Access Token', function () {
    res = http.post('https://appservicestest.harvestful.org/app-services-getUserAccessToken', null, {
      headers: { 'Authorization': `Bearer ${JSON.parse(res.body).accessToken}` },
    });

    logResponse('getUserAccessToken', res);

    check(res, {
      'getUserAccessToken status is 200': (r) => r.status === 200,
    });

    if (res.status !== 200) return;
  });

  // ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
  group('::New Session Creation', function () {
    res = http.post('https://appservicestest.harvestful.org/app-services-newSession', null, {
      headers: { 'Authorization': `Bearer ${JSON.parse(res.body).accessToken}` },
    });

    logResponse('newSession', res);

    check(res, {
      'newSession status is 200': (r) => r.status === 200,
    });
  });

  sleep(1);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// Función para loguear respuestas cuando algo sale mal o se activa DEBUG
function logResponse(name, res) {
  if (res.status !== 200) {
    console.error(`❌ ${name} failed with ${res.status}: ${res.body}`);
  } else if (__ENV.DEBUG === 'true') {
    console.log(`✅ ${name} OK: ${res.status}`);
  }
}
