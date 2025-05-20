import http from 'k6/http';
import { check, sleep } from 'k6';
import { Gauge } from 'k6/metrics';

// Creamos un metricón para VUs activos (opcional, k6 ya expone la métrica "vus" de forma automática)
const vusGauge = new Gauge('active_vus');

// Tomamos el valor de la variable de entorno TYPE_TEST (p. ej. “loadTest”)
const typeTestTag = __ENV.TYPE_TEST || 'default';

export const options = {
  vus: 1,                // Número de usuarios virtuales
  duration: '1m',        // Duración de la prueba: 1 minuto
  thresholds: {
    http_req_failed: ['rate<0.01'],    // Tasa de errores HTTP mínima
    http_req_duration: ['p(95)<500'],  // 95% de las solicitudes < 500 ms
  },
  // Añadimos tags globales: estos tags viajan con cada métrica hacia InfluxDB
  tags: {
    type_test: typeTestTag
  }
};

export default function () {
  // Registramos cuántos VUs hay activos en este instante
  vusGauge.add(__VU);

  // Hacemos la petición al endpoint de prueba
  const res = http.get('https://test.k6.io');

  // Verificamos status 200
  check(res, { 'status is 200': (r) => r.status === 200 });

  // Pause de 1 segundo entre iteraciones
  sleep(1);
}
