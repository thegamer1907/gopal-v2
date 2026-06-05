export namespace db {
	
	export class Item {
	    id: number;
	    name: string;
	    quantity: number;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new Item(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.quantity = source["quantity"];
	        this.createdAt = source["createdAt"];
	    }
	}

}

