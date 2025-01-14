import * as THREE from 'three';

/** Class for all Utils */
class Utils {

	/** @property {number} eps - Floating point precision for quaternion rotation comparison */
	static get eps() {
		return this._eps || 0.00005;
	}

	static set eps(eps) {
		this._eps = eps;
	}

	/** @property {boolean} isPresenting - Whether the page is in an immersive exclusive session */
	static get isPresenting() {
		if (typeof this._isPresenting === 'undefined') {
			this._isPresenting = false;
		}

		return this._isPresenting;
	}

	static set isPresenting(isPresenting) {
		this._isPresenting = isPresenting;
	}

	/**
	 *  Debounces function so it is only called after n milliseconds without it not being called
	 *
	 * @param {Function} func - Function to be debounced
	 * @param {number} delay - Timeout delay
	 *
	 * @example
	 * const debouncableFunction = () => {};
	 * const debouncedFunction = Utils.debounce(debouncableFunction, 500);
	 *
	 * @returns {Function} debouncedFunc - Debounced function
	 *
	 * @static
	 */
	static debounce(func, delay) {
		const debouncedFunc = function(...args) {
			const later = () => {
				debouncedFunc.id = null;
				func.apply(this, args);
			};
			clearTimeout(debouncedFunc.id);
			debouncedFunc.id = setTimeout(later, delay);
		};
		return debouncedFunc;
	}

	/**
	 * Compare both quaternions, and if the difference is big enough, activateTeleport
	 *
	 * @param {THREE.Quaternion} quaternion1 - First quaternion to compare
	 * @param {THREE.Quaternion} quaternion2 - Second quaternion to compare
	 *
	 * @example
	 * const quaternion1 = new THREE.Quaternion();
	 * const quaternion2 = new THREE.Quaternion();
	 * const areEqual = Utils.areQuaternionsEqual(quaternion1, quaternion2);
	 *
	 * @returns {boolean} difference - Whether the difference is big enough
	 *
	 * @static
	 */
	static areQuaternionsEqual(quaternion1, quaternion2) {
		if (!THREE.Quaternion.prototype.isPrototypeOf(quaternion1) || !THREE.Quaternion.prototype.isPrototypeOf(quaternion2)) {
			return false;
		}
		const difference = Math.abs(1 - quaternion1.dot(quaternion2));
		return difference < this.eps;
	}
}

export {Utils};
export {Loader} from './loader';
export {Link} from './link';
