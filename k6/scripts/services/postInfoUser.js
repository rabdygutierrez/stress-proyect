import http from 'k6/http';
import { check } from 'k6';

/**
 * Realiza una solicitud GET al endpoint principal de test.k6.io.
 * @returns {Object} El objeto de respuesta de K6.
 */
export function postInfoUser(baseURL, token) {
    const infoPayload = JSON.stringify({ token });
    const url = `${baseURL}/app-services-home/infoUser`; 
    const params = {
        headers: {
        'Content-Type': 'application/json', 
    },
  };

  const infoRes = http.post(url, infoPayload, params);
  
  check(infoRes, {
    'infoUser status 200': (r) => r.status === 200,
  });
  
  const infoBody = infoRes.json();
  const customerId = infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;

  if (!customerId || !userId) {
    console.error('No se encontró customer_id o userId en infoUser');
  }

  return {customerId, userId};
}