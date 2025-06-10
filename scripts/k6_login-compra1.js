import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// MÉTRICAS PERSONALIZADAS
const authDuration = new Trend('authentication_duration');
const infoUserDuration = new Trend('info_user_duration');
const purchaseDuration = new Trend('purchase_duration');

// CARGA DE USUARIOS DESDE JSON
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// CONFIGURACIÓN DEL ESCENARIO - SOLO 10 USUARIOS
export const options = {
  vus: 10,
  duration: '2m',
};

export default function () {
  console.log("🔁 Iniciando iteración...");

  // Seleccionar usuario aleatorio
  const user = users[Math.floor(Math.random() * users.length)];
  if (!user) {
    console.warn("❌ No se encontró un usuario válido. Revisa tu archivo JSON.");
    return;
  }

  let jar = http.cookieJar();
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org', 
    'Referer': 'https://portaltest.harvestful.org/', 
    'User-Agent': 'Mozilla/5.0',
  };

  let jsessionid;
  let token;

  // GRUPO 1: Autenticar Usuario
  group('Authenticate User', () => {
    console.log("🚀 Iniciando autenticación...");
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate', 
      payload,
      {
        headers: headersBase,
        tags: {
          name: 'authenticate',
          group: 'Authenticate User',
          method: 'POST'
        }
      }
    );

    authDuration.add(res.timings.duration, {
      name: 'authenticate',
      group: 'Authenticate User',
      status: res.status,
      method: 'POST'
    });

    const ok = check(res, {
      'auth status 200': (r) => r.status === 200,
      'auth has Set-Cookie': (r) => !!r.cookies['JSESSIONID'],
      'auth has token': (r) => {
        try {
          return r.json().result?.token !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!ok) {
      console.error("❌ Autenticación fallida:", res.body);
      return;
    }

    jsessionid = res.cookies['JSESSIONID'][0].value;
    token = res.json().result.token;

    jar.set('https://appservicestest.harvestful.org',  'JSESSIONID', jsessionid);
    console.log("✅ Autenticación exitosa. Token obtenido:", token);
  });

  if (!jsessionid || !token) {
    console.warn("⚠️ Salida anticipada: Fallo en autenticación.");
    return;
  }

  // GRUPO 2: Info User Request
  group('Info User Request', () => {
    console.log("🔍 Iniciando Info User...");
    const payload = JSON.stringify({ token });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser', 
      payload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
        tags: {
          name: 'info_user',
          group: 'Info User Request',
          method: 'POST'
        }
      }
    );

    infoUserDuration.add(res.timings.duration, {
      name: 'info_user',
      group: 'Info User Request',
      status: res.status,
      method: 'POST'
    });

    const ok = check(res, {
      'infoUser status 200': (r) => r.status === 200,
      'infoUser has data': (r) => {
        try {
          return r.body && r.body.length > 10;
        } catch (e) {
          return false;
        }
      },
    });

    if (!ok) {
      console.error("❌ InfoUser fallida:", res.body);
    } else {
      console.log("✅ InfoUser exitosa");
    }
  });

  // GRUPO 3: Compra asistida
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
}