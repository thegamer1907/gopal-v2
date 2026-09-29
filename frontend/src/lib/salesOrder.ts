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

// effectivePackSize is the pack size that actually applies to a line — its custom
// override if one was entered, else the item's master pack size. This is the ONLY
// place a line's on-screen amount/display should read pack size from (Add/Edit Order,
// Order detail) — calcOrderLine itself is never changed, it's just fed this value.
export function effectivePackSize(it: {itemPackSize: number; customPackSize: number}): number {
    return it.customPackSize || it.itemPackSize;
}

export interface OrderExportGroup {
    itemName: string;
    packSize: number; // always the item's master pack size — gross display, never custom
    rate: number;
    qty: number;
    amount: number; // gross: qty * packSize * rate
}

export interface OrderExportDeductionCalc {
    itemName: string;
    units: number; // qty * (masterPackSize - customPackSize); positive = shortfall, negative = surplus
    rate: number;
    value: number; // units * rate
}

// buildOrderExportGroups is the export-only presentation logic (image/Excel/PDF, never
// the on-screen Add/Edit Order or Order detail views): lines sharing the same item+rate
// are combined into one row shown at the item's standard pack size (gross, as if every
// carton were standard), and any line with a custom pack size contributes a separate
// deduction entry. Net total = sum(group.amount) - sum(deduction.value).
export function buildOrderExportGroups(order: {
    items: {
        itemId: number;
        itemName: string;
        itemPackSize: number;
        rate: number;
        qty: number;
        customPackSize: number;
    }[];
}): {groups: OrderExportGroup[]; deductions: OrderExportDeductionCalc[]} {
    const groups = new Map<string, OrderExportGroup>();
    const deductions: OrderExportDeductionCalc[] = [];

    for (const it of order.items) {
        const key = `${it.itemId}:${it.rate}`;
        const g = groups.get(key) ?? {
            itemName: it.itemName,
            packSize: it.itemPackSize,
            rate: it.rate,
            qty: 0,
            amount: 0,
        };
        g.qty += it.qty;
        g.amount += it.qty * it.itemPackSize * it.rate;
        groups.set(key, g);

        if (it.customPackSize && it.customPackSize !== it.itemPackSize) {
            const units = it.qty * (it.itemPackSize - it.customPackSize);
            deductions.push({itemName: it.itemName, units, rate: it.rate, value: units * it.rate});
        }
    }

    return {groups: [...groups.values()], deductions};
}
