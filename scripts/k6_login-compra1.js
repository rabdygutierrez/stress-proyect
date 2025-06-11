import http from 'k6/http';
import { check, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Métricas personalizadas
let loginFailRate = new Rate('login_fail_rate');
let loginDuration = new Trend('login_duration');
let loginSuccessCount = new Counter('login_success_count');

export let options = {
    vus: 1,
    duration: '1s', // Ajusta esto en tus escenarios reales
};

export default function () {
    const email = 'rogerxyz@mailinator.com';
    const password = 'Roger1234*';
    const channel = 'WEB';
    const device = 'ChromeTest';

    let token = '';
    let customerId = '';
    let userAccessToken = '';
    let privateIP = '';

    group('1. Authenticate', function () {
        const authRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/authenticate',
            JSON.stringify({
                email: email,
                password: password,
                channel: channel,
                device: device
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        check(authRes, {
            'status is 200': (r) => r.status === 200,
            'authenticated successfully': (r) => r.json().returnCode === 0,
        });

        if (authRes.status === 200 && authRes.json().returnCode === 0) {
            const data = authRes.json().result;
            token = data.token;
            customerId = data.customerId;
            privateIP = data.privateIP;
            loginSuccessCount.add(1);
            loginDuration.add(authRes.timings.duration);
        } else {
            loginFailRate.add(1);
            console.error('❌ Falló authenticate: ' + authRes.body);
            return;
        }
    });

    group('2. InfoUser', function () {
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

        check(infoRes, {
            'status is 200': (r) => r.status === 200,
            'infoUser ok': (r) => r.json().returnCode === 0,
        });

        if (infoRes.status !== 200) {
            console.error('⚠️ Falló infoUser: ' + infoRes.body);
            return;
        }
    });

    group('3. Get User Access Token', function () {
        const accessTokenRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
            JSON.stringify({
                email: email,
                customer_id: customerId
            }),
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        check(accessTokenRes, {
            'status is 200': (r) => r.status === 200,
            'user access token ok': (r) => r.json().returnCode === 0,
        });

        if (accessTokenRes.status === 200 && accessTokenRes.json().returnCode === 0) {
            userAccessToken = accessTokenRes.json().result.user_access_token;
            console.log(`🎟️ EVENT ACCESS TOKEN: ${userAccessToken}`);
        } else {
            console.error('⚠️ Falló getUserAccessToken: ' + accessTokenRes.body);
            return;
        }
    });

    group('4. New Session', function () {
        const newSessionRes = http.post(
            'https://appservicestest.harvestful.org/app-services-home/newSession',
            JSON.stringify({
                customer_id: customerId,
                event_access_token: userAccessToken,
                private_ip: privateIP,
                user_device: device
            }),
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        check(newSessionRes, {
            'status is 200': (r) => r.status === 200,
            'newSession ok': (r) => r.json().returnCode === 0,
        });

        if (newSessionRes.status !== 200 || newSessionRes.json().returnCode !== 0) {
            console.error('❌ Falló newSession: ' + newSessionRes.body);
        }
    });
}
