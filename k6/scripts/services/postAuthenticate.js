import http from 'k6/http';
import { check } from 'k6';

/**
 * Realiza una solicitud GET al endpoint principal de test.k6.io.
 * @returns {Object} El objeto de respuesta de K6.
 */
export function postAuthenticate(baseURL, user) {
    const authPayload = JSON.stringify({
    email: user.email,
    password: user.password,
    });
    const url = `${baseURL}/app-services-home/authenticate`; 
    const params = {
        headers: {
        'Content-Type': 'application/json', 
    },
  };

  const authRes = http.post(url, authPayload, params);
  check(authRes, {
    'authenticate status 200': (r) => r.status === 200,
    'authenticate token exists': (r) => !!r.json('result.token'),
  });

  const token = authRes.json('result.token');
  //const privateIP = authRes.json('result.privateIP');

  const setCookieHeader = authRes.headers['Set-Cookie'] || '';
  const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+);/);
  const jsessionId = jsessionMatch ? jsessionMatch[1] : null;

  if (!token || !jsessionId) {
    console.error('No se obtuvo token o JSESSIONID, abortando...');
    return;
  }
  return {token, jsessionId};
}