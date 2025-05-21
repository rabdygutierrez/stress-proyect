import http from 'k6/http';
import { check, sleep } from 'k6';
import { Gauge } from 'k6/metrics';

// Métrica personalizada (aunque "vus" ya existe por defecto)
const vusGauge = new Gauge('active_vus');

// Tipos de prueba disponibles
const testConfigs = {
  smokeTest: {
    vus: 10,
    duration: '1m',
  },
  loadTest: {
    stages: [
      { duration: '30s', target: 20 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
      { duration: '1m', target: 100 },
      { duration: '30s', target: 0 },
    ],
  },
  default: {
    vus: 1,
    duration: '30s',
  },
};

// Selección dinámica del tipo de prueba
const selectedConfig = __ENV.TYPE_TEST || 'default';
export const options = testConfigs[selectedConfig];

// Escenario de prueba
export default function () {
  vusGauge.add(__VU);

  const res = http.get('https://test.k6.io');
  check(res, { 'status is 200': (r) => r.status === 200 });

  sleep(1);
}
