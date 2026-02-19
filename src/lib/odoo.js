
import xmlrpc from 'xmlrpc';

const getOdooConfig = () => {
    const url = process.env.ODOO_URL;
    const db = process.env.ODOO_DB;
    const username = process.env.ODOO_USERNAME;
    const password = process.env.ODOO_PASSWORD; // API Key

    if (!url || !db || !username || !password) {
        throw new Error('Missing Odoo environment variables');
    }

    return { url, db, username, password };
};

const createClient = (baseUrl, endpoint) => {
    const fullUrl = new URL(endpoint, baseUrl).toString();
    const isSecure = fullUrl.startsWith('https');
    const clientOptions = {
        url: fullUrl,
        headers: {
            'User-Agent': 'NextJS-Odoo-Dashboard/1.0',
        }
    };

    return isSecure ? xmlrpc.createSecureClient(clientOptions) : xmlrpc.createClient(clientOptions);
};

export async function odooLogin() {
    const { url, db, username, password } = getOdooConfig();
    const client = createClient(url, '/xmlrpc/2/common');

    return new Promise((resolve, reject) => {
        client.methodCall('authenticate', [db, username, password, {}], (error, uid) => {
            if (error) {
                reject(error);
            } else if (!uid) {
                reject(new Error('Authentication failed: No UID returned (check credentials)'));
            } else {
                resolve(uid);
            }
        });
    });
}

export async function odooSearchRead(model, domain = [], fields = [], limit = 10) {
    const { url, db, username, password } = getOdooConfig();

    // First get UID
    // Note: In production you might want to cache the UID or session, 
    // but for simplicity we authenticate on each request or the calling function should handle it.
    // Here let's just authenticate for safety.
    const uid = await odooLogin();

    const client = createClient(url, '/xmlrpc/2/object');

    return new Promise((resolve, reject) => {
        client.methodCall('execute_kw', [
            db,
            uid,
            password,
            model,
            'search_read',
            [domain],
            { fields: fields, limit: limit }
        ], (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

export async function odooCall(model, method, args = [], kwargs = {}) {
    const { url, db, username, password } = getOdooConfig();
    const uid = await odooLogin();
    const client = createClient(url, '/xmlrpc/2/object');

    return new Promise((resolve, reject) => {
        client.methodCall('execute_kw', [
            db,
            uid,
            password,
            model,
            method,
            args,
            kwargs
        ], (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}
