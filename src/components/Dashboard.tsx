
'use client';

import { useEffect, useState, useMemo } from 'react';
import {
    Users,
    ShoppingCart,
    Package,
    TrendingUp,
    Calendar,
    ChevronDown,
    X
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
    CartesianGrid
} from 'recharts';
import clsx from 'clsx';

interface OdooData {
    customer: string;
    kpi: {
        revenue: number; // raw total
        orders: number; // raw total
        items: number;
        avgOrderValue: number;
    };
    salesByAddress: Record<string, { count: number; total: number; orders: any[] }>;
    recentInvoices: any[];
}

interface InvoiceLine {
    id: number;
    name: string;
    quantity: number;
    price_unit: number;
    price_subtotal: number;
    product_id: any[];
}

// Professional Palette (Teals, Blues, Indigos, Slates)
const COLORS = [
    '#0d9488', // Teal 600
    '#2563eb', // Blue 600
    '#4f46e5', // Indigo 600
    '#0891b2', // Cyan 600
    '#475569', // Slate 600
    '#6366f1', // Indigo 500
    '#3b82f6', // Blue 500
    '#14b8a6', // Teal 500
    '#64748b', // Slate 500
    '#818cf8', // Indigo 400
];

const MONTHS = [
    'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December', 'January', 'February', 'March'
];

export default function Dashboard() {
    const [data, setData] = useState<OdooData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // View State: 'year' (current year) or number (0-11) for specific month.
    // Note: index now corresponds to MONTHS array (0=April, 11=March)
    const [viewBy, setViewBy] = useState<'year' | number>('year');

    // Invoice Modal State
    const [invoiceId, setInvoiceId] = useState<number | null>(null);
    const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[] | null>(null);
    const [loadingInvoice, setLoadingInvoice] = useState(false);

    useEffect(() => {
        async function fetchData() {
            try {
                const res = await fetch('/api/odoo?type=stats');
                if (!res.ok) {
                    const json = await res.json();
                    throw new Error(json.error || 'Failed to fetch data');
                }
                const json = await res.json();
                setData(json);
            } catch (err: any) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, []);

    const fetchInvoiceDetails = async (id: number) => {
        setInvoiceId(id);
        setLoadingInvoice(true);
        try {
            const res = await fetch(`/api/odoo?type=invoice&id=${id}`);
            if (!res.ok) throw new Error('Failed');
            const lines = await res.json();
            setInvoiceLines(lines);
        } catch (e) {
            console.error(e);
            setInvoiceLines([]);
        } finally {
            setLoadingInvoice(false);
        }
    };

    const closeInvoiceModal = () => {
        setInvoiceId(null);
        setInvoiceLines(null);
    }

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(val);
    };

    const [selectedYear, setSelectedYear] = useState<number>(() => {
        const today = new Date();
        // If before April, the current financial year started in the previous calendar year
        return today.getMonth() < 3 ? today.getFullYear() - 1 : today.getFullYear();
    });

    // Compute available years from data
    const availableYears = useMemo(() => {
        if (!data?.salesByAddress) return [2025, 2026];
        const allOrders = Object.values(data.salesByAddress).flatMap(g => (g as any).orders);
        const years = new Set(allOrders.map(o => {
            const d = new Date(o.date);
            const orderMonth = d.getMonth(); // 0-indexed (0=Jan)
            return orderMonth >= 3 ? d.getFullYear() : d.getFullYear() - 1; // Financial year starts April
        }));
        // Ensure 2025 and 2026 are always options
        years.add(2025);
        years.add(2026);
        const uniqueYears = Array.from(years).sort((a, b) => b - a);
        return uniqueYears;
    }, [data]);

    // --- Client Side Filtering Logic (KPIs) ---
    const filteredStats = useMemo(() => {
        if (!data?.salesByAddress) return { revenue: 0, orders: 0, avg: 0 };

        const allOrders = Object.values(data.salesByAddress).flatMap(g => g.orders);

        // Use selectedYear
        const targetYear = selectedYear;

        const filteredOrders = allOrders.filter(order => {
            const d = new Date(order.date);
            const orderYear = d.getFullYear();
            const orderMonth = d.getMonth(); // 0-indexed (0=Jan)

            // Financial year logic:
            // If April-Dec, financial year is orderYear.
            // If Jan-March, financial year is orderYear - 1.
            // So for "Financial Year 2026", it spans April 2026 to March 2027.
            // Actually, usually FY 2026/27 starts in April 2026.
            // Let's assume selecting "2026" means the financial year starting April 2026.

            let financialYear = orderMonth >= 3 ? orderYear : orderYear - 1;

            if (financialYear !== targetYear) return false;

            if (viewBy === 'year') {
                return true;
            } else {
                // Specific month from the MONTHS array
                // MONTHS[0] = April (index 3), MONTHS[9] = January (index 0)
                const monthIndexInYear = (orderMonth + 9) % 12; // 0=April, 1=May... 9=Jan, 11=March
                return monthIndexInYear === viewBy;
            }
        });

        const revenue = filteredOrders.reduce((sum, o) => sum + (o.amount || 0), 0);
        const count = filteredOrders.length;

        return {
            revenue,
            orders: count,
            avg: count > 0 ? revenue / count : 0
        };
    }, [data, viewBy, selectedYear]);

    // --- Chart Logic ---
    const chartData = useMemo(() => {
        if (!data?.salesByAddress) return [];

        const allOrders = Object.values(data.salesByAddress).flatMap(g => g.orders);
        const targetYear = selectedYear;

        let grouped: Record<string, number> = {};

        if (typeof viewBy === 'number') {
            // Specific Month View -> Show Days
            // Map viewBy (0-11 for April-March) back to actual month (0-11 for Jan-Dec)
            const actualMonth = (viewBy + 3) % 12;
            const actualYear = viewBy >= 9 ? targetYear + 1 : targetYear;

            const daysInMonth = new Date(actualYear, actualMonth + 1, 0).getDate();
            for (let i = 1; i <= daysInMonth; i++) {
                grouped[i.toString()] = 0;
            }

            allOrders.forEach(order => {
                const d = new Date(order.date);
                if (d.getFullYear() === actualYear && d.getMonth() === actualMonth) {
                    grouped[d.getDate().toString()] += (order.amount || 0);
                }
            });
        } else {
            // Year View -> Show All Months in Financial Year order
            const shortMonths = MONTHS.map(m => m.substring(0, 3));
            shortMonths.forEach(m => grouped[m] = 0);

            allOrders.forEach(order => {
                const d = new Date(order.date);
                const orderYear = d.getFullYear();
                const orderMonth = d.getMonth();

                let financialYear = orderMonth >= 3 ? orderYear : orderYear - 1;

                if (financialYear === targetYear) {
                    const mShort = d.toLocaleString('default', { month: 'short' });
                    grouped[mShort] += (order.amount || 0);
                }
            });

            return shortMonths.map(m => ({ name: m, value: grouped[m] }));
        }

        return Object.entries(grouped).map(([name, value]) => ({ name, value }));
    }, [data, viewBy, selectedYear]);

    // Delivery Bar Data (Vertical)
    // Needs to filter based on current viewBy as well?
    // User asked "this should filter by month as well".
    const deliveryBarData = useMemo(() => {
        if (!data?.salesByAddress) return [];

        const customerName = data.customer || '';

        // We must aggregate dynamically based on filtering
        const aggregated: Record<string, { value: number, orders: any[] }> = {};
        const targetYear = selectedYear;

        Object.entries(data.salesByAddress).forEach(([name, stats]) => {
            // Filter orders for this address
            const validOrders = stats.orders.filter((o: any) => {
                const d = new Date(o.date);
                const orderYear = d.getFullYear();
                const orderMonth = d.getMonth();
                const financialYear = orderMonth >= 3 ? orderYear : orderYear - 1;

                if (financialYear !== targetYear) return false;
                if (typeof viewBy === 'number') {
                    const monthIndexInYear = (orderMonth + 9) % 12;
                    return monthIndexInYear === viewBy;
                }
                return true;
            });

            const total = validOrders.reduce((sum: number, o: any) => sum + (o.amount || 0), 0);
            if (total > 0) {
                aggregated[name] = { value: total, orders: validOrders };
            }
        });

        return Object.entries(aggregated)
            .map(([name, stats]) => {
                let cleanName = name;
                if (customerName && cleanName.startsWith(customerName)) {
                    cleanName = cleanName.replace(customerName, '').replace(/^,\s*/, '').trim();
                }
                if (cleanName.length < 2) cleanName = 'Main Office';

                return {
                    name: transformAddressName(cleanName),
                    fullName: name,
                    value: stats.value,
                    orders: stats.orders
                };
            })
            .sort((a, b) => b.value - a.value);
    }, [data, viewBy, selectedYear]);

    function transformAddressName(addr: string) {
        const firstPart = addr.split(',')[0];
        // Allow up to 35 characters as requested
        if (firstPart.length > 35) return firstPart.substring(0, 33) + '...';
        return firstPart;
    }

    // Custom Tooltip Component
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="custom-tooltip" style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <p className="label" style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '4px', fontSize: '14px' }}>{label}</p>
                    <p className="intro" style={{ color: payload[0].color || '#2dd4bf', fontSize: '14px', fontWeight: 500 }}>
                        {formatCurrency(payload[0].value)}
                    </p>
                    {payload[0].payload.fullName && (
                        <p style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px', maxWidth: '200px', lineHeight: '1.4' }}>{payload[0].payload.fullName}</p>
                    )}
                </div>
            );
        }
        return null;
    };

    function formatDate(dateStr: string) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        // Format as DD-MM-YYYY
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
    }

    if (loading) return <div className="full-screen-center"><div className="spinner"></div></div>;
    if (error) return <div className="full-screen-center text-red-500">{error}</div>;

    const generatePDF = (title: string, period: string, tableHead: string[][], tableBody: any[], fileName: string) => {
        const script1 = document.createElement('script');
        script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script1.onload = () => {
            const script2 = document.createElement('script');
            script2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js';
            script2.onload = () => {
                // @ts-ignore
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();

                doc.setFontSize(18);
                doc.text(title, 14, 22);
                doc.setFontSize(11);
                doc.setTextColor(100);

                doc.text(`Period: ${period}`, 14, 30);
                doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 38);

                // @ts-ignore
                doc.autoTable({
                    startY: 45,
                    head: tableHead,
                    body: tableBody,
                    theme: 'striped',
                    headStyles: { fillColor: [13, 148, 136] }
                });

                doc.save(fileName);
            };
            document.body.appendChild(script2);
        };
        document.body.appendChild(script1);
    };

    return (
        <div className="container-max">
            {/* Header */}
            <header className="header" style={{ marginBottom: '2.5rem', backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div className="header-title-group">
                    <div>
                        {/* User requested Black text to show up. Background set to light slate/white to ensure readability. */}
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#000000' }}>
                            {data?.customer ? `${data.customer}` : 'Randolph Hill'}
                        </h1>
                        <p style={{ color: '#475569', fontSize: '1.2rem', marginTop: '0.5rem', fontWeight: 500 }}>Dashboard & Analytics</p>
                    </div>
                    <div className="live-badge" title="Data is live from Odoo">
                        <span className="pulse-dot"></span> Live
                    </div>
                </div>

                <div className="filters-group" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {/* Year Selector */}
                    <select
                        value={selectedYear}
                        onChange={(e) => {
                            setSelectedYear(parseInt(e.target.value));
                            setViewBy('year'); // Reset month view when year changes
                        }}
                        className="filter-select"
                        style={{
                            background: '#ffffff', // Darker/Solid background for readability
                            border: '1px solid #cbd5e1',
                            color: '#000000', // White text
                            padding: '0.6rem 2.5rem 0.6rem 1rem',
                            borderRadius: '0.5rem',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23000000'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, // White arrow
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 0.75rem center',
                            backgroundSize: '1em'
                        }}
                    >
                        {availableYears.map(y => (
                            <option key={y} value={y}>FY {y}/{y - 2000 + 1}</option>
                        ))}
                    </select>

                    <select
                        value={viewBy === 'year' ? 'year' : viewBy}
                        onChange={(e) => {
                            const val = e.target.value;
                            setViewBy(val === 'year' ? 'year' : parseInt(val));
                        }}
                        className="filter-select"
                        style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#000000',
                            padding: '0.6rem 2.5rem 0.6rem 1rem', // Extra right padding for arrow
                            borderRadius: '0.5rem',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            appearance: 'none',
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23000000'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 0.75rem center',
                            backgroundSize: '1em'
                        }}
                    >
                        <option value="year">Full Year</option>
                        <option disabled>──────────</option>
                        {MONTHS.map((m, idx) => (
                            <option key={m} value={idx}>{m}</option>
                        ))}
                    </select>
                </div>
            </header>

            {/* Main KPI Grid */}
            <div className="grid-cols-3" style={{ gap: '1.5rem', marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="glass-card kpi-card" style={{ padding: '1.5rem', borderLeft: `4px solid ${COLORS[0]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="kpi-label">Revenue</span>
                        <TrendingUp size={20} color={COLORS[0]} />
                    </div>
                    <div className="kpi-value">{formatCurrency(filteredStats.revenue)}</div>
                    <div className="kpi-subtext">Sales (VAT Incl.)</div>
                </div>

                <div className="glass-card kpi-card" style={{ padding: '1.5rem', borderLeft: `4px solid ${COLORS[1]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="kpi-label">Invoices</span>
                        <ShoppingCart size={20} color={COLORS[1]} />
                    </div>
                    <div className="kpi-value">{filteredStats.orders}</div>
                    <div className="kpi-subtext">Posted</div>
                </div>

                <div className="glass-card kpi-card" style={{ padding: '1.5rem', borderLeft: `4px solid ${COLORS[2]}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span className="kpi-label">Avg Inv Value</span>
                        <Package size={20} color={COLORS[2]} />
                    </div>
                    <div className="kpi-value">{formatCurrency(filteredStats.avg)}</div>
                    <div className="kpi-subtext">Value</div>
                </div>
            </div>

            <div className="grid-cols-2" style={{ gap: '1.5rem' }}>
                {/* Sales Trend Chart */}
                <div className="glass-card kpi-card" style={{ padding: '1.5rem', minHeight: '450px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                        <span className="kpi-label" style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                            Sales Trend {typeof viewBy === 'number' ? `(${MONTHS[viewBy]})` : '(Year)'}
                        </span>
                    </div>
                    <div style={{ flex: 1, minHeight: '380px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 20, bottom: 20 }}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 13, dy: 10 }}
                                />
                                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Bar dataKey="value" radius={[4, 4, 4, 4]}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Sales by Delivery Address (Horizontal Bar Chart) */}
                <div className="glass-card kpi-card" style={{ padding: '1.5rem', minHeight: '600px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1' }}> {/* Increase container height */}
                    <span className="kpi-label" style={{ marginBottom: '1rem', display: 'block', fontSize: '1.2rem', fontWeight: 700, color: '#000000' }}>
                        Sales by Address (VAT Incl.)
                    </span>
                    <div style={{ flex: 1, minHeight: '520px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={deliveryBarData}
                                layout="vertical" // Switch to Horizontal Bars
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <XAxis type="number" hide /> {/* Hide X axis numbers for clean look */}
                                <YAxis
                                    dataKey="name"
                                    type="category"
                                    width={280} // Increased width for longer labels (35 chars)
                                    tick={{ fill: '#000000', fontSize: 13, fontWeight: 600 }}
                                    interval={0}
                                />
                                <Tooltip
                                    content={<CustomTooltip />}
                                    cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}> {/* Thicker bars */}
                                    {deliveryBarData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                    {/* Add Labels inside/right of bars for clarity */}
                                    <LabelList dataKey="value" position="right" formatter={(val: any) => formatCurrency(Number(val))} fill="#000000" fontSize={12} fontWeight={600} />
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Location Spend Summary Section */}
            <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem', borderTop: `4px solid ${COLORS[3]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Location Spend Summary</h3>
                    <button
                        onClick={() => {
                            const periodText = viewBy === 'year' ? `Financial Year ${selectedYear}/${selectedYear - 2000 + 1}` : `${MONTHS[viewBy]} ${viewBy >= 9 ? selectedYear + 1 : selectedYear}`;
                            const tableHead = [['Location', 'Total Spend (VAT Incl.)']];
                            const tableBody = deliveryBarData.map(item => [item.fullName, formatCurrency(item.value)]);
                            generatePDF('Location Spend Report', periodText, tableHead, tableBody, `Randolph_Spend_Report_${periodText.replace(/ /g, '_')}.pdf`);
                        }}
                        style={{
                            backgroundColor: COLORS[0],
                            color: 'white',
                            padding: '0.6rem 1.2rem',
                            borderRadius: '0.5rem',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: 'none'
                        }}
                    >
                        Download PDF Report
                    </button>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #1e293b' }}>
                                <th style={{ padding: '1rem' }}>Location</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Total Spend (VAT Incl.)</th>
                                <th style={{ padding: '1rem', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {deliveryBarData.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '1rem', fontWeight: 500, color: '#e2e8f0' }}>{item.fullName}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: COLORS[0] }}>{formatCurrency(item.value)}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => {
                                                const periodText = viewBy === 'year' ? `Financial Year ${selectedYear}/${selectedYear - 2000 + 1}` : `${MONTHS[viewBy]} ${viewBy >= 9 ? selectedYear + 1 : selectedYear}`;
                                                const tableHead = [['Ref', 'Date', 'Amount (VAT Incl.)']];
                                                const tableBody = item.orders
                                                    .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                                    .map((o: any) => [o.name, formatDate(o.date), formatCurrency(o.amount)]);
                                                generatePDF(`Branch Report: ${item.fullName}`, periodText, tableHead, tableBody, `Randolph_${item.name.replace(/ /g, '_')}_Report_${periodText.replace(/ /g, '_')}.pdf`);
                                            }}
                                            style={{ color: COLORS[1], fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline' }}
                                        >
                                            PDF Report
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {deliveryBarData.length === 0 && (
                                <tr>
                                    <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No data available for this period.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Invoices for Period List */}
            <div className="glass-card" style={{ padding: '2rem', marginTop: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Invoices for Period</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div className="table-header" style={{ fontSize: '0.9rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <span>Ref</span>
                        <span>Date</span>
                        <span>Delivery Address</span>
                        <span>Status</span>
                        <span style={{ textAlign: 'right' }}>Amount</span>
                    </div>
                    {data?.recentInvoices && data.recentInvoices
                        .filter((inv: any) => {
                            const d = new Date(inv.invoice_date || inv.date);
                            const orderYear = d.getFullYear();
                            const orderMonth = d.getMonth();
                            const financialYear = orderMonth >= 3 ? orderYear : orderYear - 1;

                            if (financialYear !== selectedYear) return false;
                            if (viewBy !== 'year') {
                                const monthIndexInYear = (orderMonth + 9) % 12;
                                if (monthIndexInYear !== viewBy) return false;
                            }
                            return true;
                        })
                        .sort((a, b) => new Date(b.invoice_date || b.date).getTime() - new Date(a.invoice_date || a.date).getTime())
                        .map((inv: any) => (
                            <div
                                key={inv.id}
                                className="list-item"
                                style={{ cursor: 'pointer', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'background 0.2s' }}
                                onClick={() => fetchInvoiceDetails(inv.id)}
                            >
                                <span style={{ fontWeight: 600, color: COLORS[1], fontSize: '1rem' }}>{inv.name}</span>
                                <span style={{ fontSize: '1rem' }}>{formatDate(inv.invoice_date || inv.date)}</span>
                                <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>
                                    {Array.isArray(inv.partner_shipping_id) ? inv.partner_shipping_id[1] : 'Main Address'}
                                </span>
                                <div>
                                    <span className={`status-badge status-${inv.state === 'posted' ? 'posted' : 'draft'}`}>
                                        {inv.state || 'Posted'}
                                    </span>
                                </div>
                                <span style={{ textAlign: 'right', fontWeight: 600, fontSize: '1rem' }}>{formatCurrency(inv.amount_total)}</span>
                            </div>
                        ))}
                </div>
            </div>

            {/* Invoice Modal */}
            {invoiceId && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(5px)' }}>
                    <div className="glass-card" style={{ width: '800px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', padding: '0', background: '#0f172a', border: '1px solid #334155', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>Invoice Details</h3>
                            <button onClick={closeInvoiceModal} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.5rem' }}><X size={24} /></button>
                        </div>
                        <div style={{ padding: '2rem', background: '#0f172a' }}>
                            {loadingInvoice ? (
                                <div className="spinner" style={{ margin: '2rem auto' }}></div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ textAlign: 'left', color: '#94a3b8', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <th style={{ paddingBottom: '1rem' }}>Description</th>
                                            <th style={{ paddingBottom: '1rem', textAlign: 'right' }}>Qty</th>
                                            <th style={{ paddingBottom: '1rem', textAlign: 'right' }}>Unit Price</th>
                                            <th style={{ paddingBottom: '1rem', textAlign: 'right' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoiceLines?.length ? invoiceLines.map((line) => (
                                            <tr key={line.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                                <td style={{ padding: '1rem 0', fontWeight: 500, color: '#e2e8f0' }}>{line.name}</td>
                                                <td style={{ padding: '1rem 0', textAlign: 'right', color: '#cbd5e1' }}>{line.quantity}</td>
                                                <td style={{ padding: '1rem 0', textAlign: 'right', color: '#cbd5e1' }}>{formatCurrency(line.price_unit)}</td>
                                                <td style={{ padding: '1rem 0', textAlign: 'right', color: COLORS[0], fontWeight: 600 }}>{formatCurrency(line.price_subtotal)}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>No items found.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
