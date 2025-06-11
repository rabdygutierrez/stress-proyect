import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

// === MÉTRICAS PERSONALIZADAS ===
const infoUserDuration = new Trend('infoUser_duration');
const newSessionDuration = new Trend('newSession_duration');

// === CARGA DE USUARIOS DESDE JSON (sólo 5) ===
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

// === CONFIGURACIÓN DEL TEST ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

// === FUNCIÓN PRINCIPAL DE TEST ===
export default function () {
  const user = users[__VU % users.length];

  group(`🧪 Login e infoUser para ${user.email}`, () => {
    console.info(`🔐 Enviando authenticate para ${user.email}`);

    const authRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      JSON.stringify({
        email: user.email,
        password: user.password,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    const authSuccess = check(authRes, {
      '🔑 Authenticate status 200': (res) => res.status === 200,
    });

    console.info(`📥 Response authenticate: ${authRes.body}`);

    if (!authSuccess) {
      console.error('❌ Error en authenticate');
      return; // Abortamos esta iteración
    }

    let token;
    try {
      token = authRes.json('result.token');
      if (!token) throw new Error('Token vacío o no encontrado');
    } catch (err) {
      console.error(`⚠️ No se pudo obtener el token: ${err.message}`);
      return;
    }

    console.info('📡 Llamando infoUser con token');

    const infoUserRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({ token }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    infoUserDuration.add(infoUserRes.timings.duration);

    console.info(`📥 Response infoUser: ${infoUserRes.body}`);

    check(infoUserRes, {
      '📊 infoUser status 200': (res) => res.status === 200,
      '✅ infoUser contiene purchasedEvents': (res) => {
        try {
          const json = res.json();
          return (
            json &&
            json.result &&
            Array.isArray(json.result.purchasedEvents)
          );
        } catch {
          return false;
        }
      },
    });

    sleep(1);
  });
}
