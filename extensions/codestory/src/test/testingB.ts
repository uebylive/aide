import { A } from "./testingA";

export class B {
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