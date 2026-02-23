
import { NextResponse } from 'next/server';
import { odooSearchRead } from '@/lib/odoo';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    try {
        let data = {};

        if (type === 'stats') {
            try {
                // 1. Find the specific customer by Ref from env var
                const customerRef = process.env.ODOO_CUSTOMER_REF;
                if (!customerRef) {
                    return NextResponse.json({ error: 'Missing ODOO_CUSTOMER_REF environment variable' }, { status: 500 });
                }
                const partners = await odooSearchRead('res.partner', [['ref', '=', customerRef]], ['id', 'name', 'child_ids']);

                if (!partners || partners.length === 0) {
                    return NextResponse.json({ error: `Customer with Ref ${customerRef} not found` }, { status: 404 });
                }

                const mainPartner = partners[0];
                const partnerId = mainPartner.id;

                // 2. Fetch Posted Invoices 2026+ (Using child_of to include all contacts)
                const invoiceFields = ['name', 'invoice_date', 'amount_total', 'amount_untaxed', 'amount_tax', 'partner_shipping_id', 'id', 'move_type', 'state'];
                const invoices = await odooSearchRead('account.move', [
                    ['partner_id', 'child_of', partnerId],
                    ['move_type', 'in', ['out_invoice', 'out_refund']],
                    ['state', '=', 'posted'],
                    ['invoice_date', '>=', '2026-01-01']
                ], invoiceFields, 1000); // Fetch last 1000 invoices

                // 3. Process Data
                let totalRevenue = 0;
                let totalOrders = invoices.length; // "Orders" now means "Invoices"

                // We'll skip "Total Items" count for now to avoid N+1 queries on lines.
                // If needed, we can do a separate aggregate query.

                const salesByAddress = {};

                invoices.forEach(inv => {
                    // Use amount_total (VAT inclusive)
                    let amountTotal = inv.amount_total || 0;

                    // Handle Credit Notes (Refunds) - Negate the amount
                    if (inv.move_type === 'out_refund') {
                        amountTotal = -Math.abs(amountTotal);
                    } else {
                        amountTotal = Math.abs(amountTotal);
                    }

                    totalRevenue += amountTotal;

                    // Group by Delivery Address
                    const addressName = Array.isArray(inv.partner_shipping_id) ? inv.partner_shipping_id[1] : 'Unknown';

                    if (!salesByAddress[addressName]) {
                        salesByAddress[addressName] = { count: 0, total: 0, orders: [] };
                    }

                    salesByAddress[addressName].count += 1;
                    salesByAddress[addressName].total += amountTotal;
                    salesByAddress[addressName].orders.push({
                        id: inv.id,
                        name: inv.name,
                        date: inv.invoice_date,
                        amount: amountTotal
                    });
                });

                // 4. Calculate Stats
                const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

                return NextResponse.json({
                    customer: mainPartner.name,
                    kpi: {
                        revenue: totalRevenue,
                        orders: totalOrders,
                        items: 0,
                        avgOrderValue: avgOrderValue
                    },
                    salesByAddress,
                    recentInvoices: invoices.map(inv => {
                        let amountTotal = inv.amount_total || 0;

                        // Negate for list display as well
                        if (inv.move_type === 'out_refund') {
                            amountTotal = -Math.abs(amountTotal);
                        } else {
                            amountTotal = Math.abs(amountTotal);
                        }

                        return {
                            ...inv,
                            amount_total: amountTotal
                        };
                    })
                });

            } catch (e) {
                console.error("Odoo fetch error:", e);
                return NextResponse.json({ error: 'Failed to fetch Odoo data: ' + e.message }, { status: 500 });
            }
        } else if (type === 'invoice') {
            const invoiceId = searchParams.get('id');
            if (!invoiceId) return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 });

            try {
                // Fetch invoice lines
                const invoiceIdInt = parseInt(invoiceId);
                let lines = [];

                try {
                    // 1) Try to fetch the invoice_line_ids from account.move (most reliable)
                    const moveRows = await odooSearchRead('account.move', [['id', '=', invoiceIdInt]], ['invoice_line_ids']);

                    if (moveRows && moveRows.length > 0 && Array.isArray(moveRows[0].invoice_line_ids) && moveRows[0].invoice_line_ids.length > 0) {
                        const lineIds = moveRows[0].invoice_line_ids;
                        // Read the actual move lines by id (returns only the official invoice lines)
                        const linesRes = await odooSearchRead('account.move.line',
                            [['id', 'in', lineIds]],
                            ['id', 'name', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'discount', 'display_type', 'account_id']
                        );
                        lines = linesRes || [];
                    } else {
                        // If invoice_line_ids are missing for this DB/version, fall back to a strict search_read
                        // Try a server-side filtered search (may fail on some DBs — we'll fallback to JS-filter)
                        try {
                            const srvLines = await odooSearchRead('account.move.line',
                                [
                                    ['move_id', '=', invoiceIdInt],
                                    ['display_type', 'not in', ['line_section', 'line_note']],
                                    ['price_subtotal', '>', 0] // prefer positive customer-visible lines
                                ],
                                ['id', 'name', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'discount', 'display_type', 'account_id']
                            );
                            lines = srvLines || [];
                        } catch (srvErr) {
                            console.warn("Server-side filtered search failed, falling back to raw read + JS filters:", srvErr?.message || srvErr);
                            const rawLines = await odooSearchRead('account.move.line',
                                [['move_id', '=', invoiceIdInt]],
                                ['id', 'name', 'product_id', 'quantity', 'price_unit', 'price_subtotal', 'discount', 'display_type', 'account_id']
                            );

                            lines = (rawLines || []).filter(l => {
                                const subtotal = parseFloat(l.price_subtotal || 0);
                                // Keep only product-linked lines, exclude section/note, and only positive subtotals
                                if (!l.product_id) return false;
                                if (l.display_type && ['line_section', 'line_note'].includes(l.display_type)) return false;
                                if (!(subtotal > 0)) return false;
                                return true;
                            });
                        }
                    }
                } catch (err) {
                    console.error("Invoice lines retrieval error:", err);
                    // final fallback: return empty items so UI doesn't break
                    return NextResponse.json([]);
                }

                // Normalize for frontend
                const items = (lines || []).map(line => {
                    const qty = parseFloat(line.quantity || 0) || 0;
                    const unit = parseFloat(line.price_unit || 0) || 0;
                    const disc = (parseFloat(line.discount || 0) || 0) / 100;
                    const subtotal = (line.price_subtotal !== undefined && line.price_subtotal !== null)
                        ? parseFloat(line.price_subtotal)
                        : unit * qty * (1 - disc);

                    return {
                        id: line.id,
                        name: (line.product_id && line.product_id[1]) || line.name || 'Item',
                        quantity: qty,
                        price_unit: Number(unit).toFixed(2),
                        price_subtotal: Number(subtotal).toFixed(2),
                        raw_subtotal: subtotal,
                        account_id: (line.account_id && line.account_id[0]) || null,
                        display_type: line.display_type || null
                    };
                });

                return NextResponse.json(items);
            } catch (e) {
                console.error("Odoo invoice fetch error:", JSON.stringify(e, null, 2));
                // Attempt to return the fault string
                return NextResponse.json({ error: e.faultString || e.message }, { status: 500 });
            }
        } else {
            return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
        }

        // Unreachable 
        return NextResponse.json({});
    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
