/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { describe, expect, test } from 'vitest';
import { Parser } from '../src/parser.js';
import { initializeTypir } from '../src/type-system.js';
import { validate } from '../src/validator.js';

const typir = initializeTypir();

describe('Validator', () => {
    test('quak', () => {
        expectValidationMessages('PRINT 1+2;');
    });
});


function expectValidationMessages(text: string, ...messages: string[]) {
    const model = new Parser().parse(text);
    const actual: string[] = [];
    validate(typir, model, m => actual.push(m));
    expect(actual).toStrictEqual(messages);
}
