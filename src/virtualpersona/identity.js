import EventEmitter from 'eventemitter3';
import uport from '../libs/uport-connect';

const ANONYMOUS_AVATAR_PATH = 'https://simbol.io/assets/models/AnonymousVP.glb';

class Identity extends EventEmitter {

	/** @property {boolean} signedIn - Whether the human is signed in */
	get signedIn() {
		if (typeof this._signedIn === 'undefined') {
			this._signedIn = false;
		}
		return this._signedIn;
	}

	set signedIn(signedIn) {
		this._signedIn = signedIn;
	}

	/** @property {string} avatarPath = Path to the current human's avatar, defaults to the anonymous avatar path */
	get avatarPath() {
		if (!this._avatarPath) {
			this._avatarPath = ANONYMOUS_AVATAR_PATH;
		}
		return this._avatarPath;
	}

	set avatarPath(avatarPath) {
		this._avatarPath = avatarPath;
	}

	/**
	 * Initializes an identity by instantiating uPort and fethcing the current identity
	 *
	 * @returns {undefined}
	 */
	constructor() {
		super();

		this.uPort = new uport.Connect('Simbol', {
			clientId: '2on1AwSMW48Asek7N5fT9aGf3voWqMkEAXJ',
			network: 'rinkeby', // Change to main net
			signer: uport.SimpleSigner('12856cfa7d87eca683cbccf3617c82c615b8cac4347db20b1874884c2bc6453d') // eslint-disable-line new-cap
		});

		const identity = this.getIdentity();
		this.signedIn = !!identity;
	}

	/**
	 * Signs the human in by showing a uPort QR code, and then saving the data
	 *
	 * @param {string} information - Pieces of information to be requested to the human
	 *
	 * @example
	 * identity.signIn('age', 'name')
	 * 	.then((error) => {
	 * 		if (!error) {
	 * 			// Person has signed in
	 * 		} else {
	 * 			// Person rejected signing in
	 * 		}
	 * 	})
	 * 	.catch((error) => {
	 * 		// A different error from the person rejecting signing in
	 * 		console.log(error);
	 * 	})
	 *
	 * @returns {Promise<string|undefined>} promise - If the user rejects signing in, it will resolve with that error object
	 */
	signIn(...information) {
		return this.uPort.requestCredentials({
			requested: information,
			verified: ['SimbolConfig'],
			notifications: true // We want this if we want to receive credentials
		}).then((credentials) => {
			this.setUPortData(credentials, true);
			this.signedIn = true;
			return Promise.resolve();
		}, (error) => {
			if (error.message === 'Request Cancelled') {
				return Promise.resolve(error);
			}
			return Promise.reject(error);
		});
	}

	/**
	 * Signs the human out, removes saved data and resets avatar path
	 *
	 * @example
	 * identity.signOut();
	 *
	 * @returns {undefined}
	 */
	signOut() {
		localStorage.removeItem('currentIdentity');
		this.avatarPath = ANONYMOUS_AVATAR_PATH;
		delete this.uPortData;
		this.signedIn = false;
	}

	/**
	 * Fetches the identity trying the following options in this order:
	 * 1. Saved in this instance
	 * 2. Saved in LocalStorage
	 *
	 * @example
	 * const identityData = identity.getIdentity();
	 *
	 * @returns {object} identity
	 *
	 * @emits Identity#error error - Error that may occur when parsing the JSON
	 */
	getIdentity() {
		if (this.uPortData) {
			return this.uPortData;
		}

		const savedIdentity = this.getIdentityFromSource();
		if (!savedIdentity) {
			return;
		}

		try {
			const identity = JSON.parse(savedIdentity);
			this.setUPortData(identity, true);
			return identity;
		} catch (error) {
			/**
			 * Identity error event that may happen parsing the JSON
			 *
			 * @event Identity#error
			 * @type {Error}
			 *
			 */
			this.emit('error', error);
		}
	}

	/**
	 * Retrieves the identity information from the correct source
	 * It first tries from the URL paramater 'simbolIdentity', if it's a site-to-site navigation
	 * Then tries from LocalStorage if the site has been visited previously
	 *
	 * @returns {object} identity
	 */
	getIdentityFromSource() {
		const urlParams = new URLSearchParams(location.search);
		const simbolIdentityParams = urlParams.get('simbolIdentity');
		if (simbolIdentityParams !== null) {
			return decodeURIComponent(simbolIdentityParams);
		}

		return localStorage.getItem('currentIdentity');
	}

	/**
	 * Saves the received credentials to this instance and optionally saves them to LocalStorage
	 *
	 * @param {object} credentials - The human's credentials from uPort
	 * @param {boolean} save - Whether to save the credentials to LocalStorage
	 *
	 * @example
	 * // Get identity information from somewhere
	 * const credentials = {};
	 * identity.setUPortData(credentials, true);
	 *
	 * @returns {undefined}
	 */
	setUPortData(credentials, save) {
		this.uPortData = {
			address: credentials.address,
			did: credentials.did,
			publicEncKey: credentials.publicEncKey,
			pushToken: credentials.pushToken,
			SimbolConfig: credentials.SimbolConfig
		};
		this.uPort.pushToken = credentials.pushToken;
		this.uPort.publicEncKey = credentials.publicEncKey;
		if (credentials.SimbolConfig) {
			const config = JSON.parse(credentials.SimbolConfig);
			this.avatarPath = config.avatar3D ||
								ANONYMOUS_AVATAR_PATH;
		}

		if (save) {
			localStorage.setItem('currentIdentity', JSON.stringify(this.uPortData));
		}
	}
}

export {Identity};

