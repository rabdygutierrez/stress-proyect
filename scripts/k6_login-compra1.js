import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Métricas personalizadas
let loginFailRate = new Rate('login_fail_rate');
let loginDuration = new Trend('login_duration');
let loginSuccessCount = new Counter('login_success_count');

export let options = {
    vus: 1,
    duration: '1s', // Ajusta según necesidad
};

export default function () {
    const email = 'rogerxyz@mailinator.com';
    const password = 'Test123**';
    const channel = 'WEB';
    const device = 'ChromeTest';

    let token = '';
    let customerId = '';
    let userAccessToken = '';
    let privateIP = '';

    group('1. Authenticate', function () {
        const authPayload = {
            email: email,
            password: password,
            channel: channel,
            device: device
        };

        console.log(`🔐 Enviando authenticate para ${email}`);

        const authRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/authenticate',
            JSON.stringify(authPayload),
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`📥 Response authenticate: ${authRes.body}`);

        check(authRes, {
            'status 200': (r) => r.status === 200,
            'login exitoso': (r) => r.json().returnCode === 0,
        });

        if (authRes.status === 200 && authRes.json().returnCode === 0) {
            const result = authRes.json().result;
            token = result.token;
            customerId = result.customerId;
            privateIP = result.privateIP;

            console.log(`✅ Token: ${token}`);
            console.log(`🆔 Customer ID: ${customerId}`);
            console.log(`🌐 Private IP: ${privateIP}`);

            loginSuccessCount.add(1);
            loginDuration.add(authRes.timings.duration);
        } else {
            loginFailRate.add(1);
            console.error('❌ Error en authenticate');
            return;
        }
    });

    group('2. InfoUser', function () {
        console.log(`📡 Llamando infoUser con token`);

        const infoRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/infoUser',
            JSON.stringify({}),
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    'X-Private-IP': privateIP
                }
            }
        );

        console.log(`📥 Response infoUser: ${infoRes.body}`);

        check(infoRes, {
            'status 200': (r) => r.status === 200,
            'infoUser exitoso': (r) => r.json().returnCode === 0,
        });

        if (infoRes.status !== 200 || infoRes.json().returnCode !== 0) {
            console.error('⚠️ Error en infoUser');
            return;
        }
    });

    group('3. GetUserAccessToken', function () {
        const tokenPayload = {
            email: email,
            customer_id: customerId
        };

        console.log(`🎫 Solicitando user access token`);

        const accessTokenRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
            JSON.stringify(tokenPayload),
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`📥 Response getUserAccessToken: ${accessTokenRes.body}`);

        check(accessTokenRes, {
            'status 200': (r) => r.status === 200,
            'token recibido': (r) => r.json().returnCode === 0,
        });

        if (accessTokenRes.status === 200 && accessTokenRes.json().returnCode === 0) {
            userAccessToken = accessTokenRes.json().result.user_access_token;
            console.log(`✅ User Access Token: ${userAccessToken}`);
        } else {
            console.error('⚠️ Error en getUserAccessToken');
            return;
        }
    });

    group('4. NewSession', function () {
        const sessionPayload = {
            customer_id: customerId,
            event_access_token: userAccessToken,
            private_ip: privateIP,
            user_device: device
        };

        console.log(`🛎️ Iniciando newSession`);

        const newSessionRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/newSession',
            JSON.stringify(sessionPayload),
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`📥 Response newSession: ${newSessionRes.body}`);

        check(newSessionRes, {
            'status 200': (r) => r.status === 200,
            'newSession exitosa': (r) => r.json().returnCode === 0,
        });

        if (newSessionRes.status !== 200 || newSessionRes.json().returnCode !== 0) {
            console.error('❌ Error en newSession');
        } else {
            console.log('🎉 Sesión creada con éxito');
        }
    });
}
