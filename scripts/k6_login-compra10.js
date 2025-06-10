import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Rate } from 'k6/metrics';

// MÉTRICAS PERSONALIZADAS
const authFailures = new Rate('authentication_failures');
const authDuration = new Trend('authentication_duration');
const infoUserFailures = new Rate('infoUser_failures');
const infoUserDuration = new Trend('infoUser_duration');
const purchaseFailures = new Rate('purchase_failures');
const purchaseDuration = new Trend('purchase_duration');
const liveAuthFailures = new Rate('live_auth_failures');
const liveAuthDuration = new Trend('live_auth_duration');
const newSessionFailures = new Rate('newSession_failures');
const newSessionDuration = new Trend('newSession_duration');
const userCount = new Counter('users_tested');

// CARGA DE USUARIOS DESDE JSON
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// CONFIGURACIÓN DEL ESCENARIO: SOLO 10 USUARIOS
export const options = {
  vus: 10,
  duration: '2m',
};

// FLUJO PRINCIPAL
export default function () {
  console.log("🔁 Iniciando iteración de usuario virtual...");

  const user = users[Math.floor(Math.random() * users.length)];
  if (!user) {
    console.warn("❌ No se encontró un usuario válido. Revisa tu archivo JSON.");
    return;
  }

  console.log("👤 Usuario seleccionado:", user.email);

  let jar = http.cookieJar();
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org', 
    'Referer': 'https://portaltest.harvestful.org/', 
    'User-Agent': 'Mozilla/5.0',
  };

  let jsessionid;
  let token; // Token del login
  let customerId;
  let userId;
  let userAccessToken;

  // GRUPO: Autenticar Usuario
  group('Authenticate User', () => {
    console.log("🚀 Iniciando autenticación...");
    const authPayload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate', 
      authPayload,
      { headers: headersBase }
    );

    authDuration.add(res.timings.duration);
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
      authFailures.add(1);
      console.error("❌ Autenticación fallida. Respuesta completa:", res.body);
      return;
    }

    jsessionid = res.cookies['JSESSIONID'][0].value;
    token = res.json().result.token;
    customerId = res.json().result.customerId;
    userId = res.json().result.userId;

    jar.set('https://appservicestest.harvestful.org',  'JSESSIONID', jsessionid);
    userCount.add(1);
    console.log("✅ Autenticación exitosa. Token obtenido:", token);
    console.log("🍪 JSESSIONID:", jsessionid);
  });

  if (!jsessionid || !token) {
    console.warn("⚠️ Salida anticipada: Fallo en autenticación.");
    return;
  }

  // GRUPO: Info User Request
  group('Info User Request', () => {
    console.log("🔍 Iniciando Info User...");
    const infoRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser', 
      JSON.stringify({ token }),
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );
    infoUserDuration.add(infoRes.timings.duration);
    const okInfo = check(infoRes, {
      'infoUser 200': (r) => r.status === 200,
      'infoUser has data': (r) => {
        try {
          return !!r.body && r.body.length > 10;
        } catch (e) {
          return false;
        }
      },
    });
    if (!okInfo) {
      infoUserFailures.add(1);
      console.error("❌ InfoUser fallida. Respuesta completa:", infoRes.body);
    } else {
      console.log("✅ InfoUser exitosa.");
    }
  });

  // GRUPO: Compra con Tarjeta
  group('Assisted CC Purchase', () => {
    console.log("💳 Iniciando compra asistida...");
    const purchasePayload = JSON.stringify({
      token: token,
      card: "",
      name: user.name || `TestFirstName_${__VU}_${__ITER}`,
      lastname: user.lastname || `TestLastName_${__VU}_${__ITER}`,
      phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: user.email,
      country: user.country || "US",
      langid: 1,
      savePaymentData: false,
      customer_id: customerId,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    });

    const purchaseRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase', 
      purchasePayload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    purchaseDuration.add(purchaseRes.timings.duration);
    const okPurchase = check(purchaseRes, {
      'purchase status 200': (r) => r.status === 200,
      'purchase has body': (r) => r.body && r.body.length > 0,
      'purchase successful': (r) => {
        try {
          const json = r.json();
          return json.returnCode === 0 && json.returnMessageCode === "OK200";
        } catch (e) {
          console.error("❌ Error al parsear JSON en compra:", e);
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

    if (!okPurchase) {
      purchaseFailures.add(1);
      console.error("❌ Compra fallida. Respuesta completa:", purchaseRes.body);
    } else {
      try {
        userAccessToken = purchaseRes.json().result.authorizationInfo.userAccessToken;
        console.log("✅ Compra exitosa. userAccessToken obtenido:", userAccessToken);
      } catch (e) {
        purchaseFailures.add(1);
        console.error("❌ No se pudo extraer userAccessToken:", e);
      }
    }
  });

  if (!userAccessToken) {
    console.warn("⚠️ Salida anticipada: No se obtuvo userAccessToken.");
    return;
  }

  // GRUPO: Live Auth
  group('Live Auth Before New Session', () => {
    console.log("📡 Iniciando Live Auth...");
    const liveAuthPayload = JSON.stringify({
      token: token,
    });

    const liveAuthRes = http.post(
      'https://appservicestest.harvestful.org/app-services-live/auth', 
      liveAuthPayload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/', 
          'Origin': 'https://livetest.harvestful.org', 
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    liveAuthDuration.add(liveAuthRes.timings.duration);
    const okLiveAuth = check(liveAuthRes, {
      'live auth status 200': (r) => r.status === 200,
      'live auth successful': (r) => {
        try {
          const json = r.json();
          return json.returnCode === 0 && json.returnMessageCode === "OK200";
        } catch (e) {
          return false;
        }
      },
      'live auth has customerId': (r) => {
        try {
          return r.json().result?.customerId !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!okLiveAuth) {
      liveAuthFailures.add(1);
      console.error("❌ Live Auth fallida. Respuesta completa:", liveAuthRes.body);
    } else {
      console.log("✅ Live Auth exitosa. Customer ID:", liveAuthRes.json().result?.customerId);
    }
  });

  // GRUPO: New Session
  group('New Session', () => {
    console.log("🔄 Iniciando New Session...");
    const newSessionPayload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId,
    });

    const newSessionRes = http.post(
      'https://appservicestest.harvestful.org/app-services-live/newSession', 
      newSessionPayload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/', 
          'Origin': 'https://livetest.harvestful.org', 
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    newSessionDuration.add(newSessionRes.timings.duration);
    const okNewSession = check(newSessionRes, {
      'newSession status 200': (r) => r.status === 200,
      'newSession successful': (r) => {
        try {
          const json = r.json();
          return json.returnCode === 0 && json.returnMessageCode === "OK200";
        } catch (e) {
          return false;
        }
      },
      'newSession has privateIP': (r) => {
        try {
          return r.json().result?.privateIP !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!okNewSession) {
      newSessionFailures.add(1);
      console.error("❌ New Session fallida. Respuesta completa:", newSessionRes.body);
    } else {
      console.log("✅ New Session exitosa. privateIP:", newSessionRes.json().result?.privateIP);
    }
  });

  sleep(1); // Pausa opcional entre iteraciones
}