import { A } from './testingA';

export class C {
    private _inner: A;

    constructor() {
        this._inner = new A();
    };

    doSomething() {
        return "A";
    };

    doInteresting() {
        return "B";
    };
}