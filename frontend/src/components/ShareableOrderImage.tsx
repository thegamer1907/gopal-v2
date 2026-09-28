import {forwardRef} from 'react';
import {db} from '../../wailsjs/go/models';
import {displayDate} from '@/lib/date';
import {fmt, fmtQty} from '@/lib/purchaseBill';
import {calcOrderLine} from '@/lib/salesOrder';

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
        const customerLabel = [order.customerNickName || order.customerName, order.customerCity]
            .filter(Boolean)
            .join(' - ');
        const rows = order.items.map((it) => ({
            it,
            finalAmount: calcOrderLine({rate: it.rate, qty: it.qty, packSize: it.itemPackSize}).finalAmount,
        }));
        const totals = rows.reduce(
            (acc, {it, finalAmount}) => ({qty: acc.qty + it.qty, amount: acc.amount + finalAmount}),
            {qty: 0, amount: 0},
        );

        return (
            <div ref={ref} style={{display: 'inline-block', background: '#fff', fontFamily: 'Arial, sans-serif'}}>
                <table style={{borderCollapse: 'collapse', fontSize: 11, color: '#000'}}>
                    <tbody>
                        <tr>
                            <td colSpan={3} style={{...cell, background: HEADER_BG, fontWeight: 700}}>
                                {customerLabel}
                            </td>
                            <td colSpan={2} style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                {displayDate(order.date)}
                            </td>
                        </tr>
                        <tr>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>Qty</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700}}>Item</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>Unit</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>Rate</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>Amount</td>
                        </tr>
                        {rows.map(({it, finalAmount}, i) => (
                            <tr key={i}>
                                <td style={{...cell, textAlign: 'center'}}>{fmtQty(it.qty)}</td>
                                <td style={cell}>{it.itemName}</td>
                                <td style={{...cell, textAlign: 'center'}}>{fmtQty(it.itemPackSize)}</td>
                                <td style={{...cell, textAlign: 'right'}}>{fmt(it.rate)}</td>
                                <td style={{...cell, textAlign: 'right'}}>{fmt(finalAmount)}</td>
                            </tr>
                        ))}
                        <tr>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'center'}}>
                                {fmtQty(totals.qty)}
                            </td>
                            <td style={{...cell, background: HEADER_BG}}/>
                            <td style={{...cell, background: HEADER_BG}}/>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>Total</td>
                            <td style={{...cell, background: HEADER_BG, fontWeight: 700, textAlign: 'right'}}>
                                {fmt(totals.amount)}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        );
    },
);
