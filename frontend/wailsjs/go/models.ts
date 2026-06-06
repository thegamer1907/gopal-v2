export namespace db {
	
	export class Item {
	    name: string;
	    packSize: number;
	    gstPercent: number;
	    hsn: number;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.packSize = source["packSize"];
	        this.gstPercent = source["gstPercent"];
	        this.hsn = source["hsn"];
	    }
	}
	export class PurchaseBillItem {
	    itemName: string;
	    itemPackSize: number;
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
	        this.itemName = source["itemName"];
	        this.itemPackSize = source["itemPackSize"];
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
	    company: string;
	    billNumber: string;
	    date: string;
	    items: PurchaseBillItem[];
	
	    static createFrom(source: any = {}) {
	        return new PurchaseBill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.company = source["company"];
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

}

