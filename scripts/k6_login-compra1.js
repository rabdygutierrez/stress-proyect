import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// MÉTRICAS
const authDuration = new Trend('authentication_duration');
const infoUserDuration = new Trend('info_user_duration');
const purchaseDuration = new Trend('purchase_duration');
const liveAuthDuration = new Trend('live_auth_duration');
const newSessionDuration = new Trend('new_session_duration');

// CARGA DE USUARIOS
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_1000.json')).usuarios
);

// CONFIGURACIÓN
export const options = {
  vus: 10,
  duration: '2m',
};

group('Assisted CC Purchase', () => {
  console.log("💳 Iniciando compra asistida...");
  const payload = JSON.stringify({
    token: token,
    card: "",
    name: user.name || `Test_${__VU}_${__ITER}`,
    lastname: user.lastname || `Test_${__VU}_${__ITER}`,
    phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
    email: user.email,
    country: user.country || "US",
    langid: 1,
    savePaymentData: false,
    customer_id: customerId,
  });

  const purchaseRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase', 
    payload,
    {
      headers: {
        ...headersBase,
        'Cookie': `JSESSIONID=${jsessionid}`,
      },
    }
  );

  purchaseDuration.add(purchaseRes.timings.duration, {
    name: 'assisted_cc_purchase',
    group: 'Assisted CC Purchase',
    status: purchaseRes.status,
    method: 'POST'
  });

  const ok = check(purchaseRes, {
    'purchase status 200': (r) => r.status === 200,
    'purchase successful': (r) => {
      try {
        const json = r.json();
        return json.returnCode === 0 && json.returnMessageCode === "OK200";
      } catch (e) {
        return false;
      }
    },
    'purchase has userAccessToken': (r) => {
      try {
        return r.json().result?.authorizationInfo?.userAccessToken !== undefined;
      } catch (e) {
        return false;
      }
    },
  });

  if (!ok) {
    purchaseFailures.add(1);
    console.error("❌ Compra fallida. Estado:", purchaseRes.status);
    console.error("❌ Respuesta completa:", purchaseRes.body);
    return;
  }

  try {
    userAccessToken = purchaseRes.json().result.authorizationInfo.userAccessToken;
    console.log("✅ userAccessToken obtenido:", userAccessToken);
  } catch (e) {
    console.error("❌ No se encontró userAccessToken en la respuesta.");
    purchaseFailures.add(1);
    return;
  }
});