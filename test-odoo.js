
import xmlrpc from 'xmlrpc';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_PASSWORD;

console.log('Testing connection with:');
console.log('URL:', url);
console.log('DB:', db);
console.log('User:', username);
console.log('Pass:', password ? '********' : 'Not Set');

if (!url || !db || !username || !password) {
    console.error('Missing credentials!');
    process.exit(1);
}

const fullUrl = new URL('/xmlrpc/2/common', url).toString();
const isSecure = fullUrl.startsWith('https');
const client = isSecure
    ? xmlrpc.createSecureClient({ url: fullUrl })
    : xmlrpc.createClient({ url: fullUrl });

client.methodCall('authenticate', [db, username, password, {}], (error, uid) => {
    if (error) {
        console.error('XML-RPC Error:', error);
    } else if (!uid) {
        console.error('Authentication Failed: No UID returned. (Possibilities: Wrong DB, User, or API Key)');
    } else {
        console.log('Success! UID:', uid);
    }
});
