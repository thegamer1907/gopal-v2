package reports

import (
	"bytes"
	"testing"
)

func TestRenderDeliveredOrdersPDFReturnsPDFBytes(t *testing.T) {
	entry := DeliveredOrdersPrintEntry{
		DeliveryNo: 7,
		Header:     OrderExportHeader{CustomerLabel: "Ravi - Pune", Date: "13-Oct-26"},
		Rows:       []OrderExportRow{{Qty: 2, ItemName: "Soap", PackSize: 10, Rate: 5, FinalAmount: 100}},
	}
	data, err := RenderDeliveredOrdersPDF([]DeliveredOrdersPrintEntry{entry})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) || len(data) < 500 {
		t.Fatalf("not a plausible PDF: %d bytes, prefix %q", len(data), data[:min(8, len(data))])
	}
}
