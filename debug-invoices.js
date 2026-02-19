
const xmlrpc = require('xmlrpc');
require('dotenv').config({ path: '.env.local' });

const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME;
const password = process.env.ODOO_PASSWORD;

console.log('Connecting to:', url, db, username);

const createClient = url.startsWith('https') ? xmlrpc.createSecureClient : xmlrpc.createClient;
const common = createClient(`${url}/xmlrpc/2/common`);
const models = createClient(`${url}/xmlrpc/2/object`);

common.methodCall('authenticate', [db, username, password, {}], (error, uid) => {
    if (error) {
        console.error('Auth Error:', error);
        return;
    }
    console.log('UID:', uid);

    // 1. Find Partners by Name "Bell"
    models.methodCall('execute_kw', [db, uid, password, 'res.partner', 'search_read', [
        [['name', 'ilike', 'Bell']]
    ], { fields: ['id', 'name', 'ref'] }], (err, partners) => {
        if (err) return console.error(err);
        console.log(`Found ${partners.length} partners matching 'Bell':`);
        partners.forEach(p => console.log(`${p.id}: ${p.name} [${p.ref}]`));

        if (!partners.length) return;

        const partnerIds = partners.map(p => p.id);

        // 3. Check Sales Orders in Jan 2026 for Head Office (3431)
        const headOfficeId = 3431;
        models.methodCall('execute_kw', [db, uid, password, 'sale.order', 'search_count', [
            [['partner_id', 'child_of', headOfficeId], ['date_order', '>=', '2026-01-01'], ['date_order', '<=', '2026-01-31']]
        ]], (err, countOrders2026) => {
            if (err) return console.error('Sale Order Error:', err);
            console.log(`Sales Orders count for Head Office (3431) in Jan 2026: ${countOrders2026}`);

        // 6. Inspect Specific Invoice 150491
        models.methodCall('execute_kw', [db, uid, password, 'account.move', 'search_read', [
            [['id', '=', 150491]]
        ], { fields: ['id', 'name', 'partner_id', 'invoice_date', 'state', 'move_type', 'amount_total'] }], (err, specificInv) => {
            if (err) return console.error('Specific Invoice Error:', err);
            if (!specificInv.length) {
                console.log('Invoice 150491 NOT FOUND.');
                // Try searching by name just in case
                models.methodCall('execute_kw', [db, uid, password, 'account.move', 'search_read', [
                    [['name', '=', '150491']]
                 ], { fields: ['id', 'name', 'partner_id', 'invoice_date', 'state', 'move_type'] }], (err, specificInvName) => {
                    if (specificInvName.length) {
                        console.log('Found by name "150491":', specificInvName[0]);
                    } else {
                        console.log('Invoice 150491 not found by ID or Name.');
                    }
                 });
                return;
            }
            const inv = specificInv[0];
            const pName = Array.isArray(inv.partner_id) ? inv.partner_id[1] : inv.partner_id;
            console.log(`\n--- INSPECTION OF 150491 ---`);
            console.log(`ID: ${inv.id}`);
            console.log(`Name: ${inv.name}`);
            console.log(`Partner: ${pName} (ID: ${inv.partner_id[0]})`);
            console.log(`Date: ${inv.invoice_date}`);
            console.log(`State: ${inv.state}`);
            console.log(`Type: ${inv.move_type}`); // Should be 'out_invoice'
            console.log(`Amount: ${inv.amount_total}`);
            
            // Check if this partner is a child of 3431
            models.methodCall('execute_kw', [db, uid, password, 'res.partner', 'search_read', [
                [['id', '=', inv.partner_id[0]]]
            ], { fields: ['parent_id', 'name'] }], (err, pInfo) => {
                if(pInfo && pInfo.length) {
                    const parent = pInfo[0].parent_id;
                    console.log(`Partner Parent: ${parent ? parent[1] + ' (ID: ' + parent[0] + ')' : 'None'}`);
                    console.log(`Is Parent ID 3431? ${parent && parent[0] === 3431}`);
                }
            });
        });
        });
    });
});
