'use strict';

import EventEmitter from 'eventemitter3';
import {Interactions} from '../../src/interactions/interactions';
import {Selection} from '../../src/interactions/selection';

describe('Interactions', () => {

	let interactions;

	beforeEach(() => {
		sinon.stub(Selection.prototype, '_createReticle');

		interactions = new Interactions();
	});

	afterEach(() => {
		Selection.prototype._createReticle.restore();
	});

	it('should be a class', () => {
		assert.isFunction(Interactions);
	});

	it('should have a set of methods', () => {
		assert.isFunction(Interactions.prototype.update);
		assert.isFunction(Interactions.prototype.getMeshes);
		assert.isFunction(Interactions.prototype.setUpEventListeners);
	});

	describe('#constructor', () => {

		it('should extend EventEmitter and initialise Selection', () => {
			assert.instanceOf(interactions.selection, Selection);
			assert.isTrue(Selection.prototype._createReticle.calledOnce);
			assert.instanceOf(interactions, EventEmitter);
		});
	});

	describe('#update', () => {

		const position = 1;
		const orientation = 2;

		beforeEach(() => {
			interactions.selection = {
				update: sinon.stub()
			};

			interactions.update(position, orientation);
		});

		it('should update selection', () => {
			assert.isTrue(interactions.selection.update.calledOnce);
			assert.isTrue(interactions.selection.update.calledWith(position, orientation));
		});
	});

	describe('#getMeshes', () => {

		const reticle = 1;
		let meshes;

		beforeEach(() => {
			interactions.selection = {
				reticle
			};

			meshes = interactions.getMeshes();
		});

		it('should return all interaction meshes', () => {
			assert.deepEqual(meshes, [1]);
		});
	});

	describe('#setUpEventListeners', () => {

		let emitter;

		beforeEach(() => {
			emitter = {
				on: sinon.stub()
			};

			interactions.setUpEventListeners(emitter);
		});

		it('should add event listeners to emitter', () => {
			assert.isTrue(emitter.on.calledOnce);
			assert.isTrue(emitter.on.calledWith('triggerpressed'));
		});
	});
});