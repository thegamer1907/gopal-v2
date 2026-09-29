// Shared sales-order helpers. Final Amount is NOT stored — both Add Order and (later)
// View/Edit Orders derive it from the same raw fields here, so the formula lives in
// exactly one place, mirroring lib/purchaseBill.ts.

export interface OrderLineCalcInput {
    rate: number;
    qty: number;
    packSize: number;
}

export interface OrderLineCalc {
    finalAmount: number; // "Final Amount" = Rate × Qty × Pack Size
}

export function calcOrderLine(input: OrderLineCalcInput): OrderLineCalc {
    const {rate, qty, packSize} = input;
    return {finalAmount: rate * qty * packSize};
}

// customerShareLabel builds the "{nickname||name} - {city}" line used on every
// customer-facing order export (Copy Order Image, Download Excel, Download PDF) — kept
// in one place so all three stay identical.
export function customerShareLabel(order: {
    customerNickName: string;
    customerName: string;
    customerCity: string;
}): string {
    return [order.customerNickName || order.customerName, order.customerCity].filter(Boolean).join(' - ');
}
