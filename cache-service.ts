import { Subject, Subscription } from "rxjs"

// Type Definitions
type ComponentType<T> = { new(...args:any[]): T; };
type EventType<T> = ComponentType<T> & { getType(): string; };


// Classes
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
    constructor(data: T, ticket: TimeTicket) {
        this.trackedData = data;
        this.ticket = ticket;
    }

    public unwrap(): T {
        return this.trackedData;
    }
}

class Hashable {
    public hash(identifier?: string|number): string {
        return Hashable.generateHash(this.constructor.name, identifier);
    }

    static hash<T extends Hashable>(type: ComponentType<T>, identifier?: string|number): string {
        return Hashable.generateHash(type.name, identifier);
    }

    private static generateHash(compName: string, identifier?: string|number): string {
        return [compName, '_', identifier].join('')
    }
}

class CacheService {

    private cacheMap: Map<string, Expirable<any>>;
    private callTickets: Map<string, TimeTicket>

    constructor() {
        this.cacheMap = new Map<string, Expirable<any>>();
        this.callTickets = new Map<string,TimeTicket>();
    }

    public hasRecords<T extends Hashable>(compType?: ComponentType<T>): boolean {
        if(compType) return this.getKeysOfType(compType).length > 0;
        return this.cacheMap.size > 0;
    }

    private getKeysOfType<T>(compType: ComponentType<T>) {
        let keys = [];
        for(let key of this.cacheMap.keys()) {
            if(key.indexOf(compType.name) !== -1) {
                keys.push(key);
            }
        }
        return keys;
    }

    private getKeysOfTypeAsync<T>(compType: ComponentType<T>): Promise<string[]> {
        return new Promise<string[]>((res, rej) => {
            try {
                res(this.getKeysOfType(compType));
            }
            catch(e) { rej(e); }
        });
    }

    has<T extends Hashable>(modelType: ComponentType<T>, id: number | string): boolean {
        const key = Hashable.hash<T>(modelType, id);
        return this.cacheMap.has(key) && !this.cacheMap.get(key).ticket.isExpired;
    }

    getAll<T extends Hashable>(compType?: ComponentType<T>): T[] {
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

    getAllAsync<T extends Hashable>(compType?: ComponentType<T>): Promise<T[]> {
        return new Promise((res, rej) => {
            res(this.getAll(compType));
        });
    }

    get<T extends Hashable>(modelType: ComponentType<T>, id?: number | string): T {
        return this.cacheMap.get(Hashable.hash<T>(modelType, id)).unwrap();
    }

    set<T extends Hashable>(model: T): void {
        let expirableModel = new Expirable(model, TimeTicket.fromSeconds(120))
        this.cacheMap.set(model.hash(), expirableModel);
    }

    delete<T extends Hashable>(compType: ComponentType<T>, id: number | string): void {
        this.cacheMap.delete(Hashable.hash(compType, id));
    }

    clear<T>(compType?: ComponentType<T>): void {
        if(compType) this.getKeysOfType(compType).forEach(this.cacheMap.delete);
        else this.cacheMap.clear();
    }

    assignTicket(methodName: string, ticket: TimeTicket) {
        this.callTickets.set(methodName, ticket);
    }

    isMethodCallExpired(methodName: string) {
        return !this.callTickets.has(methodName) || this.callTickets.get(methodName).isExpired;
    }
    
}

class CacheServiceFactory {
    getCacheBucket<T>(serviceType: ComponentType<T>) : CacheService {
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


export class BaseEvent<T> {
    public readonly eventArgs: T;

    constructor(eventArgs?: T) {
        this.eventArgs = eventArgs;
    }

    protected static type = 'BaseEvent';
    public getType(): string {
        return (this.constructor as EventType<T> & { type: string }).type;
    }
    public static getType(): string {
        return this.type;
    }
}

export class SpecificEvent extends BaseEvent<string> {
    protected static type = 'SpecificEvent';
}

export class ApplicationStateService {

    // TODO M.A.: write tests:
    // * eventMap should be empty when no event has been subscribed to
    // * eventMap should remove a recrod alongside the underlying Observable should all subscribers unsubscribe.
    // * eventMap should create a new record with an Observable whenever an event is being subscribed to and a record for that specific event type doen't exists
    // otherwise use the existing one.

    // subscribe to one event type? or subscribe to systemwide changes?
    private globalState: Map<string, any>;
    private eventMap: Map<any, Subject<any>>;

    constructor() {
        this.globalState = new Map<string, any>();
        this.eventMap = new Map<string, Subject<any>>();
    }

    public subscribeToEvent<U,T extends BaseEvent<U>>(eventType: EventType<T>, next: (eventArgs: U) => void, error?: (error: any) => void, complete?: () => void): Subscription {
        const eventTypeName = eventType.getType();
        let eventObservable: Subject<U>;
        if (this.eventMap.has(eventTypeName)) eventObservable = this.eventMap.get(eventTypeName);
        else {
            eventObservable = new Subject<U>();
            this.eventMap.set(eventTypeName, eventObservable);
        }

        console.log(['subscribed to Event Type:', eventTypeName].join(' '));
        const sub = eventObservable.subscribe(next, error, complete);

        return new Subscription(() => {
            sub.unsubscribe();
            console.log(['unsubscribed from Event Type:', eventTypeName].join(' '));
            if (this.eventMap.get(eventTypeName).observers.length <= 0) {
                this.eventMap.delete(eventTypeName);
                console.log(['Subject of Type:', eventTypeName, 'has been removed'].join(' '));
            }
        });
    }

    public raiseEvent<T extends BaseEvent<any>>(pxlEvent: T) {
        const eventType = pxlEvent.getType();
        console.log(`event type: ${eventType} has been raised with args: ${pxlEvent.eventArgs}`);
        if (this.eventMap.has(eventType)) {
            this.eventMap.get(eventType).next(pxlEvent.eventArgs);
        } else {
            console.log(`no subscribers to event type: ${eventType}`);
            // should something happen?
        }
    }

    // use a library?
    public registerToState(component: string, state: any) {
        this.globalState.set(component, state);

        return {
            unregister: (() => { this.unregisterFromState(component); }).bind(this)
        };
    }

    // still requires a lot of work
    // register to global state?
    // component passes it self?

    public retrieveComponentState(component: string): any {
        return this.globalState.get(component);
    }

    public unregisterFromState(component: string): void {
        this.globalState.delete(component);
    }
}

// hmmm, no intellisense support for the resulting object.
function keysToProperties(obj: any): any {
    const props = {};
    for (const prop in obj) {
        if (typeof (obj[prop]) === 'object') {
            Object.assign(props, { ...keysToProperties(obj[prop]) }); // = keysToProperties(prop);
        } else {
            Object.assign(props, { [prop]: prop });
        }
    }
    return props;
}

function logClass<T extends BaseEvent<any>>( comp: { new(...args: any[]): T; getType: () => string } ) {
    console.log(comp.getType());
}

logClass(BaseEvent);
logClass(SpecificEvent);
console.log(new BaseEvent().getType());
console.log(new SpecificEvent().getType());
const appService = new ApplicationStateService();
const eventSub = appService.subscribeToEvent(SpecificEvent, (eventArgs: string) => {
    console.log(eventArgs);
});
appService.raiseEvent(new SpecificEvent('Ello from Specific Event'));
eventSub.unsubscribe();


class SpecificEventArgs {
    constructor(public name: string, public id: number) {
    }
}
class ClickEvent extends BaseEvent<SpecificEventArgs> {
    protected static type: string = "ClickEvent";
}

const clickEventSub = appService.subscribeToEvent(ClickEvent, (eventArgs: SpecificEventArgs) => {
    console.log(eventArgs.id, eventArgs.name);
});
appService.raiseEvent(new ClickEvent({id: 1, name: 'Mohammad'}));
clickEventSub.unsubscribe();