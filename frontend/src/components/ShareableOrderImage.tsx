import {forwardRef} from 'react';
import {db} from '../../wailsjs/go/models';
import {displayDate} from '@/lib/date';
import {fmt, fmtQty} from '@/lib/purchaseBill';
import {buildOrderExportGroups, customerShareLabel} from '@/lib/salesOrder';

// Purpose-built layout for the "Copy Order Image" share feature (SavedOrders.tsx) —
// rasterized via html-to-image and copied to the clipboard for pasting into WhatsApp.
// Deliberately not a reuse of OrderDetail's on-screen table: this is a customer-facing
// summary (no GST%/HSN), styled to match the client's reference (yellow header/footer
// bars, black-bordered grid) rather than the app's normal shadcn table look. Colors are
// plain hex, not Tailwind's oklch-based tokens, so the rasterized image's colors are
// predictable regardless of theme.
const HEADER_BG = '#FFD966';
const BORDER = '1px solid #000';
const cell: React.CSSProperties = {border: BORDER, padding: '2px 6px', lineHeight: 1.3};

export const ShareableOrderImage = forwardRef<HTMLDivElement, {order: db.SalesOrder}>(
    function ShareableOrderImage({order}, ref) {
        const customerLabel = customerShareLabel(order);
        const {groups, deductions} = buildOrderExportGroups(order);
        const grossTotals = groups.reduce(
            (acc, g) => ({qty: acc.qty + g.qty, amount: acc.amount + g.amount}),
            {qty: 0, amount: 0},
        );
        const deductionTotal = deductions.reduce((sum, d) => sum + d.value, 0);
        const netAmount = grossTotals.amount - deductionTotal;

        return (
            <div ref={ref} style={{display: 'inline-block', background: '#fff', fontFamily: 'Arial, sans-serif'}}>
                <table style={{borderCollapse: 'collapse', fontSize: 11, color: '#000'}}>
                    <tbody>
                        <tr>
                            <td colSpan={5} style={{...cell, background: HEADER_BG, fontWeight: 700, fontSize: 13}}>
                                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                                    <span>{customerLabel}</span>
                                    <span>{displayDate(order.date)}</span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>Qty</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700}}>Item</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>Unit</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>Rate</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>Amount</td>
                        </tr>
                        {groups.map((g, i) => (
                            <tr key={i}>
                                <td style={{...cell, textAlign: 'center'}}>{fmtQty(g.qty)}</td>
                                <td style={cell}>{g.itemName}</td>
                                <td style={{...cell, textAlign: 'center'}}>{fmtQty(g.packSize)}</td>
                                <td style={{...cell, textAlign: 'right'}}>{fmt(g.rate)}</td>
                                <td style={{...cell, textAlign: 'right'}}>{fmt(g.amount)}</td>
                            </tr>
                        ))}
                        <tr>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>
                                {fmtQty(grossTotals.qty)}
                            </td>
                            <td colSpan={3} style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                Total
                            </td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                {fmt(grossTotals.amount)}
                            </td>
                        </tr>
                        {deductions.map((d, i) => {
                            const isAdd = d.units < 0;
                            const units = isAdd ? -d.units : d.units;
                            const value = isAdd ? -d.value : d.value;
                            return (
                                <tr key={i}>
                                    <td colSpan={4} style={{...cell, textAlign: 'right'}}>
                                        {isAdd ? 'Add' : 'Less'}: {fmtQty(units)} — {d.itemName}
                                    </td>
                                    <td style={{...cell, textAlign: 'right'}}>{fmt(value)}</td>
                                </tr>
                            );
                        })}
                        {deductions.length > 0 && (
                            <tr>
                                <td colSpan={4} style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                    Total
                                </td>
                                <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                    {fmt(netAmount)}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        );
    },
);
