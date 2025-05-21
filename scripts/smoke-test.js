import http from 'k6/http';
import { check, sleep } from 'k6';
import { Gauge } from 'k6/metrics';
import * as TypesTest from '../utils/TypeTest.js'
 

// Creamos un metricón para VUs activos (opcional, k6 ya expone la métrica "vus" de forma automática)
const vusGauge = new Gauge('active_vus');

// Tomamos el valor de la variable de entorno TYPE_TEST (p. ej. “loadTest”)
const typeTestTag = __ENV.TYPE_TEST || 'default';

export let options = TypesTest.typesTest[__ENV.TYPE_TEST]

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
