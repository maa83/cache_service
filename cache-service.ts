class TimeTicket {
    private expiresAt: Date;
    private invalidated = false;

    constructor(expiryDate: Date) {
        this.expiresAt = expiryDate;
    }

    public get isExpired(): boolean {
        return this.invalidated || this.expiresAt > new Date();
    }

    public invalidate() {
        this.invalidated = true;
    }

    public static fromSeconds(seconds: number): TimeTicket {
        const now = new Date();
        return new TimeTicket( new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds() + seconds) );
    }
}

interface IHashable {
    hash(): string;
}

class Expirable<T> {
    public ticket: TimeTicket;
    public trackedData: T;
    constructor(data: T) {
        this.trackedData = data;
    }
}

class Hashable {
    public hash(identifier?: string|number): string {
        return Hashable.generateHash(this.constructor.name, identifier);
    }

    static hash<T extends Hashable>(type: {new():T}, identifier?: string|number): string {
        return Hashable.generateHash(type.name, identifier);
    }

    private static generateHash(compName: string, identifier?: string|number): string {
        return [compName, '_', identifier].join('')
    }
}

type CompType<T> = {new(...args:any[]):T};

class CacheService {

    private cacheMap: Map<string, any>;
    private callTickets: Map<string, TimeTicket>

    constructor() {
        this.cacheMap = new Map<string, any>();
        this.callTickets = new Map<string,TimeTicket>();
    }

    public hasRecords<T extends Hashable>(compType?: CompType<T>): boolean {
        if(compType) return this.getKeysOfType(compType).length > 0;
        return this.cacheMap.size > 0;
    }

    private getKeysOfType<T>(compType: CompType<T>) {
        let keys = [];
        for(let key of this.cacheMap.keys()) {
            if(key.indexOf(compType.name) !== -1) {
                keys.push(key);
            }
        }
        return keys;
    }

    private getKeysOfTypeAsync<T>(compType: CompType<T>): Promise<string[]> {
        return new Promise<string[]>((res, rej) => {
            try {
                res(this.getKeysOfType(compType));
            }
            catch(e) { rej(e); }
        });
    }

    has<T extends Hashable>(modelType: CompType<T>, id: number | string): boolean {
        return this.cacheMap.has(Hashable.hash<T>(modelType, id));
    }

    getAll<T extends Hashable>(compType?: CompType<T>): T[] {
        return ( () => {
            if(compType) {
                return this.getKeysOfType(compType).map(key => this.cacheMap.get(key));
            }

            let items = [];
            for(let item of this.cacheMap.values())
                items.push(item);
            return items;
        })();
    }

    getAllAsync<T extends Hashable>(compType?: CompType<T>): Promise<T[]> {
        return new Promise((res, rej) => {
            res(this.getAll(compType));
        });
    }

    get<T extends Hashable>(modelType: CompType<T>, id?: number | string): T {
        return this.cacheMap.get(Hashable.hash<T>(modelType, id));
    }

    set<T extends Hashable>(model: T): void {
        console.log('saving model', model);
        this.cacheMap.set(model.hash(), model);
    }

    delete(id: number | string): void {

    }

    clear(): void {
        this.cacheMap.clear();
    }

    assignTicket(methodName: string, ticket: TimeTicket) {
        this.callTickets.set(methodName, ticket);
    }

    isMethodCallExpired(methodName: string) {
        return !this.callTickets.has(methodName) || this.callTickets.get(methodName).isExpired;
    }
    
}

class CacheServiceFactory {
    getCacheBucket<T>(serviceType: CompType<T>) : CacheService {
        if (this.serviceBuckets.has(serviceType.name)) return this.serviceBuckets.get(serviceType.name)
        else {
            const service = new CacheService();
            this.serviceBuckets.set(serviceType.name, service);
            return service;
        }
    }

    // invalidate Expiry Tickets
    forceRefresh() {

    }
    
    serviceBuckets: Map<string, CacheService>;
}

class SomeService {
    constructor () {

    }

    getAllData() : DataModel[] {
        // call api 1
        // call api 2

        // morph data into one object

        // constult caching service
        return [new DataModel(123, 'LOL'), new DataModel(1234, 'LOLZ')]
    }

    getData(id: number) : DataModel {
        return this.getAllData().filter(model => model.id === id)[0];
    }

    saveData(data: DataModel) {
        // save data to backend
    }

    deleteData(id: number) {

    }

    updateData(data: DataModel) {

    }

    getDataBySomecondition(filter: {id?: number, name?: string}): DataModel[] {
        let { id, name } = filter;
        // access api /api/someMethod/?fitler1=val&filter2=val2
        return this.getAllData().filter(model => model.id === id);
    }
}

class SomeServiceCached extends SomeService {

    constructor(private readonly cacheService: CacheService) {
        super();
    }

    getData(id: number): DataModel {
        if(this.cacheService.has(DataModel, id)) {
            console.log('item exists in cache');
            return this.cacheService.get(DataModel, id);
        }
        else {
            let data = super.getData(id);
            if (data) {
                //if (!this.cacheService.has(DataModel, id)) this.cacheService.set(data);
                this.cacheService.set(data);
            }
            return data;
        }
    }

    getAllData(): DataModel[] {
        if(this.cacheService.hasRecords(DataModel)) {
            console.log('items exists in cache');
            return this.cacheService.getAll(DataModel);
        }
        else {
            const data = super.getAllData();
            if(data) data.forEach( item => this.cacheService.set(item) );
            return data;
        }
    }

    async getAllDataAsync(): Promise<DataModel[]> {
        if(this.cacheService.hasRecords(DataModel)) {
            console.log('items exists in cache');
            return await this.cacheService.getAllAsync(DataModel);
        }
        else {
            const data = super.getAllData();
            if(data) data.forEach( item => this.cacheService.set(item) );
            return data;
        }
    }

    saveData(data: DataModel): void {
        this.cacheService.set(data);
        super.saveData(data);
    }
}

class DataModel extends Hashable {
    constructor(
        public id?: number,
        public name?: string) {
            super();
    }

    public hash() {
        return super.hash(this.id);
    }
}

let someService = new SomeServiceCached(new CacheService());
let dataModel = someService.getData(123);
dataModel.name = 'LOLLZZ';
someService.saveData(dataModel);
console.log(someService.getData(123));
console.log(someService.getAllData());
someService.getAllDataAsync().then(res => {
    console.log(res);
})

// double saving
// method call ticket / item ticket / method call ticket with arguments
// implement expirable.
// async ?