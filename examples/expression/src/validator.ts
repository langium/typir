/******************************************************************************
 * Copyright 2024 TypeFox GmbH
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 ******************************************************************************/
import { TypirServices } from 'typir';
import { Model } from './ast.js';

export function validate(typir: TypirServices, model: Model, accept: (message: string) => void) {
    model.forEach(i => typir.validation.Collector.validate(i).forEach(m => accept(m.message)));
}
