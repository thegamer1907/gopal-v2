// Shared purchase-bill helpers. The calculated columns (GST amount, totals, final
// rates) are NOT stored — both the Add and Saved bill screens derive them from the
// same raw fields here, so the formulas live in exactly one place. See docs/UI.md.

export function num(v: string): number {
    return parseFloat(v) || 0;
}

export function fmt(n: number): string {
    return n.toFixed(2);
}

export interface LineCalcInput {
    taxQty: number;
    taxValue: number;
    dQty: number;
    dValue: number;
    gstPercent: number;
    packSize: number;
}

export interface LineCalc {
    gstAmount: number;
    taxBillAmount: number; // "Tax Bill Amount"
    billValue: number; // "Bill Value"
    billingRate: number; // "Billing Rate"
    finalRate: number; // "Final Rate"
}

// Derived (display-only) values for one line, per the agreed formulas:
//   GST Amount      = TaxValue × GST% / 100
//   Tax Bill Amount = TaxValue + GST Amount
//   Bill Value      = Tax Bill Amount + D Value
//   Billing Rate    = TaxValue / TaxQty
//   Final Rate      = Bill Value / (TaxQty + D Qty) × PackSize
export function calcLine(input: LineCalcInput): LineCalc {
    const {taxQty, taxValue, dQty, dValue, gstPercent, packSize} = input;
    const gstAmount = (taxValue * gstPercent) / 100;
    const taxBillAmount = taxValue + gstAmount;
    const billValue = taxBillAmount + dValue;
    const qty = taxQty + dQty;
    const finalRate = qty ? (billValue / qty) * packSize : 0;
    const billingRate = taxQty ? taxValue / taxQty : 0;
    return {gstAmount, taxBillAmount, billValue, billingRate, finalRate};
}
