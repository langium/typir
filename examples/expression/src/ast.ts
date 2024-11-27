/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
export interface BinaryExpression {
    type: 'binary';
    left: Expression;
    right: Expression;
    op: '+'|'-'|'/'|'*'|'%';
}

export interface UnaryExpression {
    type: 'unary';
    operand: Expression;
    op: '+'|'-';
}

export interface Identifier {
    type: 'variable-usage';
    ref: Variable;
}

export interface Numeric {
    type: 'numeric';
    value: number;
}

export interface CharString {
    type: 'string';
    value: string;
}

export type Expression = UnaryExpression | BinaryExpression | Identifier | Numeric | CharString;

export interface Variable {
    type: 'variable-declaration';
    name: string;
    value: Expression;
}

export interface Printout {
    type: 'printout';
    value: Expression;
}

export type Model = Array<Variable | Printout>;

export namespace AST {
    export function variable(name: string, value: Expression): Variable {
        return { type: 'variable-declaration', name, value };
    }
    export function printout(value: Expression): Printout {
        return { type: 'printout', value };
    }
    export function num(value: number): Numeric {
        return {
            type: 'numeric',
            value
        };
    }
    export function string(value: string): CharString {
        return {
            type: 'string',
            value
        };
    }
    export function binary(left: Expression, op: BinaryExpression['op'], right: Expression): BinaryExpression {
        return {
            type: 'binary',
            left,
            op,
            right
        };
    }
    export function unary(op: UnaryExpression['op'], operand: Expression): UnaryExpression {
        return {
            type: 'unary',
            op,
            operand
        };
    }

    export function useVariable(variable: Variable): Identifier {
        return {
            ref: variable,
            type: 'variable-usage'
        };
    }
}
