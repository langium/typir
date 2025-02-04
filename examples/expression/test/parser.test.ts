/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { describe, expect, test } from 'vitest';
import { AST, Model } from '../src/ast.js';
import { Parser } from '../src/parser.js';

describe('Parser', () => {
    test('parse', () => {
        expectAST('VAR A = 1;', [AST.variable('A', AST.num(1))]);
        expectAST('PRINT 1;', [AST.printout(AST.num(1))]);
        expectError('PRINT(A);', "Unknown symbol 'A'!");
        expectAST('PRINT 1+2*3;', [AST.printout(AST.binary(AST.num(1), '+', AST.binary(AST.num(2), '*', AST.num(3))))]);
        expectAST('PRINT --1;', [AST.printout(AST.unary('-', AST.unary('-', AST.num(1))))]);
        expectAST('PRINT "Hello, \\"User\\"!";', [AST.printout(AST.string('Hello, "User"!'))]);
        const variable = AST.variable('A', AST.num(1));
        expectAST('VAR A = 1; PRINT(A);', [variable, AST.printout(AST.useVariable(variable))]);
    });
});

function expectAST(text: string, expected: Model) {
    const actual = new Parser().parse(text);
    expect(actual).toEqual(expected);
}

function expectError(text: string, message: string) {
    expect(()=> {
        new Parser().parse(text);
    }).toThrow(message);
}
