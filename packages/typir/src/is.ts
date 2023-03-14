import { PrimitiveType } from "./primitive";

export const Primitive = Symbol('Primitive');

export function isPrimitiveType<T>(type: unknown): type is PrimitiveType<T> {
    return isType(type, Primitive);
}

function isType(type: unknown, symbol: symbol): boolean {
    if (typeof type !== 'object' || !type) {
        return false;
    }
    const value = type as { '_type': symbol };
    return value._type === symbol;
}
