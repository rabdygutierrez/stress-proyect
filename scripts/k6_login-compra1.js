import http from 'k6/http';
import { check, sleep } from 'k6';

export default function () {
  const email = 'usuario@mail.com';
  const password = 'Test123**';
  const customerId = 12345;
  const userId = 67890;

  let authToken = '';
  let eventAccessToken = '';
  let userJsessionId = '';

  // 1) Authenticate
  let authenticateUrl = 'https://appservicestest.harvestful.org/app-services-home/authenticate';
  let authenticatePayload = JSON.stringify({ email, password });
  let authenticateHeaders = {
    'accept': 'application/json, text/plain, */*',
    'content-type': 'application/json',
    'origin': 'https://portaltest.harvestful.org',
    'referer': 'https://portaltest.harvestful.org/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  };

  console.log('[Authenticate] Enviando solicitud con payload:', authenticatePayload);
  let authenticateRes = http.post(authenticateUrl, authenticatePayload, { headers: authenticateHeaders });
  console.log(`[Authenticate] Status: ${authenticateRes.status}`);

  if (authenticateRes.status !== 200) {
    console.error('[Authenticate] ERROR: Respuesta no exitosa');
  } else {
    const setCookie = authenticateRes.headers['Set-Cookie'] || '';
    const jsessionMatch = setCookie.match(/JSESSIONID=([^;]+);/);
    if (jsessionMatch) {
      userJsessionId = jsessionMatch[1];
      console.log('[Authenticate] JSESSIONID extraído:', userJsessionId);
    } else {
      console.error('[Authenticate] No se encontró JSESSIONID en Set-Cookie');
    }
  }

  check(authenticateRes, { 'authenticate status 200': (r) => r.status === 200 });

  // 2) getUserAccessToken
  let tokenUrl = 'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken';
  let tokenPayload = JSON.stringify({ email, customer_id: customerId });
  let tokenHeaders = Object.assign({}, authenticateHeaders, { 'Cookie': `JSESSIONID=${userJsessionId}` });

  console.log('[getUserAccessToken] Payload:', tokenPayload);
  let tokenRes = http.post(tokenUrl, tokenPayload, { headers: tokenHeaders });
  console.log(`[getUserAccessToken] Status: ${tokenRes.status}`);

  if (tokenRes.status === 200) {
    authToken = tokenRes.json('token') || '';
    console.log('[getUserAccessToken] Token recibido:', authToken);
  } else {
    console.error('[getUserAccessToken] ERROR al obtener token');
  }

  check(tokenRes, { 'getUserAccessToken status 200': (r) => r.status === 200 });

  // 3) infoUser
  let infoUserUrl = 'https://appservicestest.harvestful.org/app-services-home/infoUser';
  let infoUserPayload = JSON.stringify({ token: authToken });
  let infoUserHeaders = Object.assign({}, authenticateHeaders, { 'Cookie': `JSESSIONID=${userJsessionId}` });

  console.log('[infoUser] Payload:', infoUserPayload);
  let infoUserRes = http.post(infoUserUrl, infoUserPayload, { headers: infoUserHeaders });
  console.log(`[infoUser] Status: ${infoUserRes.status}`);

  if (infoUserRes.status !== 200) {
    console.error('[infoUser] ERROR en respuesta');
  } else {
    console.log('[infoUser] Datos usuario recibidos');
  }

  check(infoUserRes, { 'infoUser status 200': (r) => r.status === 200 });

  // 4) auth (LIVE)
  let liveAuthUrl = 'https://appservicestest.harvestful.org/app-services-live/auth';
  let liveAuthPayload = JSON.stringify({ token: authToken });
  let liveAuthHeaders = Object.assign({}, authenticateHeaders, {
    'origin': 'https://livetest.harvestful.org',
    'referer': 'https://livetest.harvestful.org/',
    'Cookie': `JSESSIONID=${userJsessionId}`
  });

  console.log('[Live Auth] Payload:', liveAuthPayload);
  let liveAuthRes = http.post(liveAuthUrl, liveAuthPayload, { headers: liveAuthHeaders });
  console.log(`[Live Auth] Status: ${liveAuthRes.status}`);

  if (liveAuthRes.status === 200) {
    eventAccessToken = liveAuthRes.json('eventAccessToken') || '';
    console.log('[Live Auth] eventAccessToken recibido:', eventAccessToken);
  } else {
    console.error('[Live Auth] ERROR en autenticación LIVE');
  }

  check(liveAuthRes, { 'live auth status 200': (r) => r.status === 200 });

  // 5) newSession
  let newSessionUrl = 'https://appservicestest.harvestful.org/app-services-live/newSession';
  let newSessionPayload = JSON.stringify({
    token: eventAccessToken,
    customerId: customerId,
    userId: userId
  });
  let newSessionHeaders = Object.assign({}, authenticateHeaders, {
    'origin': 'https://livetest.harvestful.org',
    'referer': 'https://livetest.harvestful.org/',
    'Cookie': `JSESSIONID=${userJsessionId}`
  });

  console.log('[newSession] Payload:', newSessionPayload);
  let newSessionRes = http.post(newSessionUrl, newSessionPayload, { headers: newSessionHeaders });
  console.log(`[newSession] Status: ${newSessionRes.status}`);

  if (newSessionRes.status !== 200) {
    console.error('[newSession] ERROR al crear sesión nueva');
  } else {
    console.log('[newSession] Sesión creada exitosamente');
  }

  check(newSessionRes, { 'newSession status 200': (r) => r.status === 200 });

  sleep(1);
}
