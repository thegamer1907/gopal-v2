export namespace db {
	
	export class Company {
	    id: number;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new Company(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class Customer {
	    id: number;
	    name: string;
	    nickName: string;
	    address1: string;
	    address2: string;
	    city: string;
	    state: string;
	    pincode: string;
	    gstin: string;
	    mobile: string;
	
	    static createFrom(source: any = {}) {
	        return new Customer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.nickName = source["nickName"];
	        this.address1 = source["address1"];
	        this.address2 = source["address2"];
	        this.city = source["city"];
	        this.state = source["state"];
	        this.pincode = source["pincode"];
	        this.gstin = source["gstin"];
	        this.mobile = source["mobile"];
	    }
	}
	export class Item {
	    id: number;
	    companyId: number;
	    companyName: string;
	    name: string;
	    packSize: number;
	    gstPercent: number;
	    hsn: number;
	    stock: number;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.companyId = source["companyId"];
	        this.companyName = source["companyName"];
	        this.name = source["name"];
	        this.packSize = source["packSize"];
	        this.gstPercent = source["gstPercent"];
	        this.hsn = source["hsn"];
	        this.stock = source["stock"];
	    }
	}
	export class PurchaseBillItem {
	    itemId: number;
	    itemName: string;
	    itemPackSize: number;
	    gstPercent: number;
	    hsn: number;
	    taxQty: number;
	    taxValue: number;
	    dQty: number;
	    dValue: number;
	    discount: number;
	    remarks: string;
	
	    static createFrom(source: any = {}) {
	        return new PurchaseBillItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemId = source["itemId"];
	        this.itemName = source["itemName"];
	        this.itemPackSize = source["itemPackSize"];
	        this.gstPercent = source["gstPercent"];
	        this.hsn = source["hsn"];
	        this.taxQty = source["taxQty"];
	        this.taxValue = source["taxValue"];
	        this.dQty = source["dQty"];
	        this.dValue = source["dValue"];
	        this.discount = source["discount"];
	        this.remarks = source["remarks"];
	    }
	}
	export class PurchaseBill {
	    id: number;
	    companyId: number;
	    companyName: string;
	    billNumber: string;
	    date: string;
	    items: PurchaseBillItem[];
	
	    static createFrom(source: any = {}) {
	        return new PurchaseBill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.companyId = source["companyId"];
	        this.companyName = source["companyName"];
	        this.billNumber = source["billNumber"];
	        this.date = source["date"];
	        this.items = this.convertValues(source["items"], PurchaseBillItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class RateHistoryEntry {
	    date: string;
	    rate: number;
	
	    static createFrom(source: any = {}) {
	        return new RateHistoryEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.rate = source["rate"];
	    }
	}
	export class SalesOrderItem {
	    itemId: number;
	    itemName: string;
	    itemPackSize: number;
	    gstPercent: number;
	    hsn: number;
	    rate: number;
	    qty: number;
	    customPackSize: number;
	
	    static createFrom(source: any = {}) {
	        return new SalesOrderItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemId = source["itemId"];
	        this.itemName = source["itemName"];
	        this.itemPackSize = source["itemPackSize"];
	        this.gstPercent = source["gstPercent"];
	        this.hsn = source["hsn"];
	        this.rate = source["rate"];
	        this.qty = source["qty"];
	        this.customPackSize = source["customPackSize"];
	    }
	}
	export class SalesOrder {
	    id: number;
	    customerId: number;
	    customerName: string;
	    customerNickName: string;
	    customerCity: string;
	    date: string;
	    deliveryNo: number;
	    delivered: boolean;
	    items: SalesOrderItem[];
	
	    static createFrom(source: any = {}) {
	        return new SalesOrder(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.customerId = source["customerId"];
	        this.customerName = source["customerName"];
	        this.customerNickName = source["customerNickName"];
	        this.customerCity = source["customerCity"];
	        this.date = source["date"];
	        this.deliveryNo = source["deliveryNo"];
	        this.delivered = source["delivered"];
	        this.items = this.convertValues(source["items"], SalesOrderItem);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace reports {
	
	export class OrderExportDeduction {
	    itemName: string;
	    units: number;
	    rate: number;
	    value: number;
	
	    static createFrom(source: any = {}) {
	        return new OrderExportDeduction(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemName = source["itemName"];
	        this.units = source["units"];
	        this.rate = source["rate"];
	        this.value = source["value"];
	    }
	}
	export class OrderExportHeader {
	    orderId: number;
	    customerLabel: string;
	    date: string;
	
	    static createFrom(source: any = {}) {
	        return new OrderExportHeader(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.orderId = source["orderId"];
	        this.customerLabel = source["customerLabel"];
	        this.date = source["date"];
	    }
	}
	export class OrderExportRow {
	    itemName: string;
	    packSize: number;
	    rate: number;
	    qty: number;
	    finalAmount: number;
	
	    static createFrom(source: any = {}) {
	        return new OrderExportRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.itemName = source["itemName"];
	        this.packSize = source["packSize"];
	        this.rate = source["rate"];
	        this.qty = source["qty"];
	        this.finalAmount = source["finalAmount"];
	    }
	}
	export class OrderReportRow {
	    date: string;
	    customerName: string;
	    customerCity: string;
	    itemName: string;
	    packSize: number;
	    gstPercent: number;
	    hsn: number;
	    qty: number;
	    rate: number;
	    finalAmount: number;
	    delivered: boolean;
	    deliveryNo: number;
	
	    static createFrom(source: any = {}) {
	        return new OrderReportRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.customerName = source["customerName"];
	        this.customerCity = source["customerCity"];
	        this.itemName = source["itemName"];
	        this.packSize = source["packSize"];
	        this.gstPercent = source["gstPercent"];
	        this.hsn = source["hsn"];
	        this.qty = source["qty"];
	        this.rate = source["rate"];
	        this.finalAmount = source["finalAmount"];
	        this.delivered = source["delivered"];
	        this.deliveryNo = source["deliveryNo"];
	    }
	}
	export class PurchaseSummaryRow {
	    date: string;
	    companyName: string;
	    billNumber: string;
	    itemName: string;
	    hsn: number;
	    packSize: number;
	    taxQty: number;
	    taxValue: number;
	    dQty: number;
	    dValue: number;
	    gstPercent: number;
	    gstAmount: number;
	    taxBillAmount: number;
	    billValue: number;
	    billingRate: number;
	    finalRate: number;
	    discount: number;
	    remarks: string;
	
	    static createFrom(source: any = {}) {
	        return new PurchaseSummaryRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.date = source["date"];
	        this.companyName = source["companyName"];
	        this.billNumber = source["billNumber"];
	        this.itemName = source["itemName"];
	        this.hsn = source["hsn"];
	        this.packSize = source["packSize"];
	        this.taxQty = source["taxQty"];
	        this.taxValue = source["taxValue"];
	        this.dQty = source["dQty"];
	        this.dValue = source["dValue"];
	        this.gstPercent = source["gstPercent"];
	        this.gstAmount = source["gstAmount"];
	        this.taxBillAmount = source["taxBillAmount"];
	        this.billValue = source["billValue"];
	        this.billingRate = source["billingRate"];
	        this.finalRate = source["finalRate"];
	        this.discount = source["discount"];
	        this.remarks = source["remarks"];
	    }
	}
	export class StockReportRow {
	    companyName: string;
	    itemName: string;
	    packSize: number;
	    hsn: number;
	    stock: number;
	
	    static createFrom(source: any = {}) {
	        return new StockReportRow(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.companyName = source["companyName"];
	        this.itemName = source["itemName"];
	        this.packSize = source["packSize"];
	        this.hsn = source["hsn"];
	        this.stock = source["stock"];
	    }
	}

}

export namespace updater {
	
	export class Info {
	    currentVersion: string;
	    latestVersion: string;
	    available: boolean;
	    downloadUrl: string;
	    checksumHex: string;
	    releaseNotes: string;
	    releaseUrl: string;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.available = source["available"];
	        this.downloadUrl = source["downloadUrl"];
	        this.checksumHex = source["checksumHex"];
	        this.releaseNotes = source["releaseNotes"];
	        this.releaseUrl = source["releaseUrl"];
	    }
	}

}

