import Peer from 'simple-peer';
import EventEmitter from 'eventemitter3';
import * as THREE from 'three';
import {Loader} from '../utils/loader';

const defaultConfig = {
	socketURL: 'wss://ws.simbol.io',
	socketPort: 443,
	channelName: 'default',
	iceServers: [
		{urls: 'stun:global.stun.twilio.com:3478?transport=udp'},
		{urls:'stun:stun.l.google.com:19302'},
		{
			urls: 'turn:albertoelias.me:3478?transport=udp',
			username: 'alberto',
			credential: 'pzqmtestinglol'
		}
	],
	peer: {
		trickle: true,
		objectMode: false,
		config: {}
	}
};

/**
 * Utility function to get a value from a nested object based on a string representing that nesting
 *
 * @param {Object} object - The object to get the nested value from
 * @param {string} value - String representing the path to the value e.g. 'b.c'
 *
 * @example
 * const object = { inner: { mostInner: 1 } };
 * const retrievedValue = getDeepValue(object, 'inner.mostInner');
 *
 * @returns {*} value
 */
function getDeepValue(object, value) {
	const pathArray = value.split('.');
	return pathArray.reduce((innerObject, key) =>
		innerObject && innerObject[key] !== 'undefined' ? innerObject[key] : undefined, object
	);
}

/**
 * Utility function to get a value from a nested object based on a string representing that nesting
 *
 * @param {Object} object - The object to get the nested value from
 * @param {string} key - String representing the path to the key e.g. 'b.c'
 * @param {*} value - The value to set the key to
 *
 * @example
 * const object = { inner: { mostInner: 1 } };
 * const retrievedValue = setDeepValue(object, 'inner.mostInner', 2);
 *
 * @returns {*} value
 */
function setDeepValue(object, key, value) {
	const pathArray = key.split('.');
	if (pathArray.length === 1) {
		object[pathArray[0]] = value;
		return object[pathArray[0]];
	} else {
		if (object[pathArray[0]]) {
			return setDeepValue(object[pathArray[0]], pathArray.slice(1).join('.'), value);
		} else {
			return undefined;
		}
	}
}

class MultiUser extends EventEmitter {

	/** @property {Object} objects - Map of all networked objects */
	get objects() {
		if (!this._objects) {
			this._objects = {};
		}
		return this._objects;
	}

	set objects(objects) {
		this._objects = objects;
	}

	/** @property {Object} cachedObjects - Cache of objects that couldn't be added */
	get cachedObjects() {
		if (!this._cachedObjects) {
			this._cachedObjects = [];
		}
		return this._cachedObjects;
	}

	set cachedObjects(cachedObjects) {
		this._cachedObjects = cachedObjects;
	}

	/** @property {Object} objectsNeedingAudio - Map of all objects that need an audioHelper added but it hasn't loaded yet */
	get objectsNeedingAudio() {
		if (!this._objectsNeedingAudio) {
			this._objectsNeedingAudio = {};
		}
		return this._objectsNeedingAudio;
	}

	set objectsNeedingAudio(objectsNeedingAudio) {
		this._objectsNeedingAudio = objectsNeedingAudio;
	}

	/** @property {Object} remotePeer - Map of all peers to their ids */
	get remotePeers() {
		if (!this._remotePeers) {
			this._remotePeers = {};
		}
		return this._remotePeers;
	}

	set remotePeers(remotePeers) {
		this._remotePeers = remotePeers;
	}

	/**
	 * Initializes a MultiUser instance
	 *
	 * @param {Object} config - Configuration parameters
	 *
	 * @emits MultiUser#error
	 */
	constructor(config = {}) {
		super();

		this.config = Object.assign({}, defaultConfig, config);
		this.audioListener = new THREE.AudioListener();
		this.socket = this.createSocket();

		this.getStream()
			.then((stream) => {
				this.stream = stream;
				for (const peer of Object.values(this.remotePeers)) {
					peer.addStream(stream);
				}
			})
			.catch((error) => {
				/**
				 * MultiUser error event, sometimes forwarding errors
				 * from other functions or objects
				 *
				 * @event MultiUser#error
				 * @type {Error}
				 *
				 */
				this.emit('error', error);
			});
	}

	/**
	 * Adds a new networked object
	 *
	 * @param {object} data - Data about the object to be added
	 * @param {string} data.type - The object's type ('path', 'name', 'Object3D')
	 * @param {string|THREE.Object3D} data.value - The path, object name or instance of THREE.Object3D to fetch the object
	 * @param {boolean} data.isAvatar - Whether the object corresponds to one of the peer's avatar
	 * @param {boolean} data.parent - Whether it's a synced object that's a child of another
	 * @param {number} data.parent.id - The ID of the parent object
	 * @param {array} data.animatedValues - The keys of the object to be animated
	 * @param {number} data.id - The id of the networked object
	 * @param {number} data.lastUpdate - Time in ms when the object data was last changed
	 * @param {number|string} data.owner - The peer id of the owner. If it's the local peer, it can use the string 'self'
	 * @param {number} peerId - Id corresponding to the peer that is sharing the object
	 *
	 * @returns {Promise} promise
	 *
	 * @emits MultiUser#add
	 * @emits MultiUser#error
	 */
	addObject(data, peerId) {
		if (this.objects[data.id]) {
			return Promise.resolve();
		}

		if (typeof this.id === 'undefined') {
			this.cachedObjects.push(data);
			return Promise.resolve();
		}

		if (data.parent && data.parent.id && !this.objects[data.parent.id]) {
			setTimeout(() => {
				this.addObject(data, peerId);
			}, 200);
			return Promise.resolve();
		}

		if (typeof peerId === 'undefined') {
			peerId = this.id;
		}

		if (data.owner === 'self') {
			data.owner = this.id;
		}

		return this._loadObject(data).then((object) => {
			const now = performance.now();

			if (data.isAvatar && peerId !== this.id) {
				// Adds the positional audio object to position it with the mesh
				if (this.remotePeers[peerId].audioHelper) {
					object.add(this.remotePeers[peerId].audioHelper);
				} else {
					this.objectsNeedingAudio[peerId] = object;
				}
			}

			if (!data.id) {
				data.id = object.uuid;
			}

			if (peerId === this.id) {
				if (data.isAvatar && !data.parent) {
					this.broadcast(JSON.stringify({
						type: 'update',
						firstUpdate: true,
						object: {
							type: 'path',
							value: this.localAvatar.avatarPath,
							lastUpdate: now,
							id: data.id,
							isAvatar: true,
							owner: this.id
						}
					}));
				} else {
					this.broadcast(JSON.stringify({
						type: 'update',
						firstUpdate: true,
						object: {
							type: data.type,
							value: data.value,
							lastUpdate: now,
							id: data.id,
							parent: data.parent,
							isAvatar: data.isAvatar,
							owner: this.id
						}
					}));
				}
			} else if (!data.parent || !data.parent.id) {
				/**
				 * MultiUser add event that provides a mesh to be added to the scene
				 *
				 * @event MultiUser#add
				 * @type {object}
				 * @property {THREE.Mesh} mesh - Mesh to add to the scene
				 */
				this.emit('add', {
					mesh: object
				});
			}

			const animatedValues = {};
			for (const value of data.animatedValues || []) {
				animatedValues[value] = undefined;
			}

			if (data.parent && data.parent.id) {
				const parent = this.objects[data.parent.id];
				parent && parent.children.push(data.id);
			}

			this.objects[data.id] = {
				id: data.id,
				object3D: object,
				type: data.type,
				value: data.value,
				isAvatar: data.isAvatar,
				parent: data.parent || {},
				children: [],
				owner: typeof data.owner !== 'undefined' ? data.owner : '',
				lastUpdate: data.lastUpdate || now,
				animatedValues: animatedValues,
				position: [],
				rotation: [],
				scale: []
			};
		}).catch((error) => {
			this.emit('error', error);
		});
	}

	/**
	 * Removes a networked object
	 *
	 * @param {number} id - The id of the networked object
	 *
	 * @returns {undefined}
	 */
	removeObject(id) {
		const object = this.objects[id];
		if (!object || object.owner !== this.id) {
			return;
		}

		if (object.children) {
			for (const childId of object.children) {
				this.removeObject(childId);
			}
		}

		if (object.parent && object.parent.id) {
			this._removeFromParent(object);
		}

		delete this.objects[id];
		this.broadcast(JSON.stringify({
			type: 'remove',
			object: {
				id,
				owner: this.id
			}
		}));
	}

	/**
	 * Helper function that removes a reference to the child object from the parent
	 *
	 * @param {object} object - The object to be removed from the parent
	 *
	 * @returns {undefined}
	 */
	_removeFromParent(object) {
		const parent = this.objects[object.parent.id];
		const index = parent.children.indexOf(object.id);
		if (index !== -1) {
			parent.children.splice(index, 1);
		}
	}

	/**
	 * Wrapper function for different object loading methods
	 *
	 * @param {object} data - Object's data
	 * @param {string} data.type - String that explains how to load the object ('path', 'name', 'Object3D')
	 * @param {string|THREE.Object3D} - Where to load the object from based on the type
	 *
	 * @returns {Promise} promise
	 *
	 * @emits Multiuser#error
	 *
	 * @private
	 */
	_loadObject(data) {
		const parentId = data.parent ? data.parent.id : undefined;
		const parentObject = this.objects[parentId];
		const parent = parentObject ? parentObject.object3D : this.config.scene;
		return new Promise((resolve, reject) => {
			switch (data.type) {
			case 'path':
				this._loadObjectFromPath(data.value).then(resolve, reject);
				break;
			case 'name':
				this._loadObjectFromName(data.value, parent).then(resolve, reject);
				break;
			case 'Object3D':
				resolve(data.value);
				break;
			default:
				reject(new Error('Shared object wrong ' + data.type + data.value));
			}
		});
	}

	/**
	 * Helper function to fetch an object in the scene based on its name
	 *
	 * @param {string} name - Name of the object
	 * @param {Object3D} parent - The mesh from where to search for the object
	 *
	 * @returns {Promise} promise
	 *
	 * @private
	 */
	_loadObjectFromName(name, parent) {
		return new Promise((resolve, reject) => {
			const object = parent.getObjectByName(name);
			if (!object) {
				reject(`Simbol.MultiUser: No object found with name ${name} in the scene to be networked`);
			} else {
				resolve(object);
			}
		});
	}

	/**
	 * Helper function to load an object from a path
	 *
	 * @param {string} path - Path from where to load an object
	 *
	 * @returns {Promise} promise - Resolves to a loaded object
	 *
	 * @private
	 */
	_loadObjectFromPath(path) {
		const vpLoader = new Loader(path);
		return vpLoader.load()
			.then((loadedMesh) => Promise.resolve(loadedMesh))
			.catch((error) => Promise.reject(error));
	}

	/**
	 * Makes this peer take ownership of a networked object
	 *
	 * @param {THREE.Object3D} object - Object to take ownership of
	 *
	 * @returns {undefined}
	 */
	grabOwnership(object) {
		for (const objectId of Object.keys(this.objects)) {
			const objectData = this.objects[objectId];
			if (objectData.isAvatar) {
				continue;
			}

			if (objectData.object3D === object) {
				const now = performance.now();
				if (objectData.owner !== this.id &&
					objectData.lastUpdate < now) {

					objectData.owner = this.id;
					objectData.lastUpdate = now;
					this.broadcast(JSON.stringify({
						type: 'update',
						object: {
							id: objectId,
							lastUpdate: objectData.lastUpdate,
							owner: objectData.owner
						}
					}));
				}
				return;
			}
		}
	}

	/**
	 * Wrapper around getUserMedia
	 *
	 * @example
	 * multiUser.getStream()
	 * 	.then((stream) => {
	 * 		// We got a stream
	 * 	})
	 * 	.catch((error) => {
	 * 		console.log(error);
	 * 	});
	 *
	 * @returns {Promise<MediaStream>} stream
	 */
	getStream() {
		return new Promise((resolve, reject) => {
			navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => {
				resolve(stream);
			}, (error) => {
				reject(error);
			});
		});
	}

	/**
	 * Updates all peer meshes with their current position and rotation
	 * Executed on every animation frame
	 *
	 * @example
	 * simbol.addAnimateFunctions(multiUser.animate.bind(multiUser));
	 *
	 * @returns {undefined}
	 */
	animate() {
		for (const object of Object.values(this.objects)) {
			if (object.owner !== this.id) {
				for (let i = 0; i < 3; i++) {
					if (typeof object.position[i] !== 'number') {
						object.position[i] = 0;
					}
					if (typeof object.rotation[i] !== 'number') {
						object.rotation[i] = 0;
					}
					if (typeof object.rotation[i] !== 'number') {
						object.scale[i] = 0;
					}
				}
				object.object3D.position.set(...object.position);
				object.object3D.rotation.set(...object.rotation);

				for (const key of Object.keys(object.animatedValues)) {
					setDeepValue(object.object3D, key, object.animatedValues[key]);
				}
			} else {
				this.sendData(object);
			}
		}
	}

	/**
	 * Creates a new WebSocket with the set configuration and sets event handlers
	 *
	 * @example
	 * const socket = multiUser.createSocket();
	 *
	 * @returns {WebSocket} socket - Created WebSocket
	 */
	createSocket() {
		const socket = new WebSocket(`${this.config.socketURL}:${this.config.socketPort}`);

		socket.addEventListener('error', this._socketError.bind(this));
		socket.addEventListener('message', this._socketMessage.bind(this));

		return socket;
	}

	/**
	 * Error handler for a WebSocket
	 *
	 * @param {Object} error - Error event Object
	 *
	 * @returns {undefined}
	 *
	 * @emits MultiUser#error
	 *
	 * @private
	 */
	_socketError(error) {
		this.emit('error', error);
	}

	/**
	 * Message handler for a WebSocket
	 *
	 * @param {Object} event - Event object for a socket message
	 *
	 * @returns {undefined}
	 *
	 * @private
	 */
	_socketMessage(event) {
		const message = JSON.parse(event.data);
		console.log('socket message', message);
		if (message.type === 'open') {
			this.id = message.from;
			this._addCachedObjects();
		} else if (message.type === 'connected') {
			if (!this.remotePeers[message.from]) {
				const remotePeer = this.createPeer(true, message.from, this.stream);
				this.remotePeers[message.from] = remotePeer;
			}
		} else if (message.type === 'signal') {
			// Offer, answer or icecandidate
			if (!this.remotePeers[message.from]) {
				const remotePeer = this.createPeer(false, message.from, this.stream);
				this.remotePeers[message.from] = remotePeer;
			}
			const peer = this.remotePeers[message.from];
			peer.signal(JSON.parse(message.content));
		} else if (message.type === 'disconnected') {
			delete this.remotePeers[message.from];
		}
	}

	/**
	 * Creates a new SimplePeer with the default configuration
	 *
	 * @param {boolean} initiator - Whether this peer is the initiator of the communication
	 * @param {number} id - This peer's id, sent by the signalling server
	 * @param {MediaStream} stream - Stream obtained from getUserMedia for audio
	 *
	 * @example
	 * // stream is obtained from getUserMedia
	 * const peer1 = multiUser.createPeer(false, 1, stream);
	 *
	 * @returns {Peer} peer - Created SimplePeer
	 */
	createPeer(initiator, id, stream) {
		this.config.peer.initiator = initiator;
		this.config.peer.channelName = this.config.channelName;
		if (stream) {
			this.config.peer.streams = [stream];
		}
		this.config.peer.config.iceServers = this.config.iceServers;

		const peer = new Peer(this.config.peer);

		peer.id = id;
		peer.multiUser = this;

		peer.on('stream', this._peerStream.bind(peer));
		peer.on('signal', this._peerSignal.bind(peer));
		peer.on('error', this._peerError.bind(peer));
		peer.on('connect', this._peerConnect.bind(peer));
		peer.on('data', this._peerData.bind(peer));
		peer.on('close', this._peerClose.bind(peer));

		return peer;
	}

	/**
	 * Stream handler for a Peer instance
	 * It creates an <audio> element to autoplay the incoming stream
	 *
	 * @param {MediaStream} stream - Incoming stream from the Peer instance
	 *
	 * @returns {undefined}
	 */
	_peerStream(stream) {
		this.audioHelper = new THREE.PositionalAudio(this.multiUser.audioListener);
		const sourceNode = this.audioHelper.context.createMediaStreamSource(stream);
		this.audioHelper.setNodeSource(sourceNode);

		// Workaround for Chrome to output audio
		let audioObj = document.createElement('audio');
		audioObj.srcObject = stream;
		audioObj = null;

		const objectNeedingAudio = this.multiUser.objectsNeedingAudio[this.id];
		if (objectNeedingAudio) {
			objectNeedingAudio.add(this.audioHelper);
			delete this.multiUser.objectsNeedingAudio[this.id];
		}
	}

	/**
	 * Signal handler for a Peer instance
	 *
	 * @param {Object} data - Event object for a signal handler
	 *
	 * @returns {undefined}
	 *
	 * @private
	 */
	_peerSignal(data) {
		this.multiUser.socket.send(JSON.stringify({
			type: 'signal',
			content: JSON.stringify(data),
			from: this.multiUser.id,
			to: this.id
		}));
	}

	/**
	 * Error handler for a Peer instance
	 *
	 * @param {Object} error - Event object for an error handler
	 *
	 * @returns {undefined}
	 *
	 * @emits MultiUser#error
	 *
	 * @private
	 */
	_peerError(error) {
		this.multiUser.emit('error', error);
	}

	/**
	 * Connect handler for a Peer instance
	 *
	 * @returns {undefined}
	 *
	 * @private
	 */
	_peerConnect() {
		console.log('peer connected');
		this.connected = true;
		for (const object of Object.values(this.multiUser.objects)) {
			if (object.owner === this.multiUser.id) {
				if (object.object3D === this.multiUser.localAvatar) {
					this.send(JSON.stringify({
						type: 'update',
						firstUpdate: true,
						object: {
							type: 'path',
							value: this.multiUser.localAvatar.avatarPath,
							isAvatar: true,
							id: object.id,
							owner: object.owner,
							lastUpdate: object.lastUpdate
						}
					}));
				} else {
					this.send(JSON.stringify({
						type: 'update',
						firstUpdate: true,
						object: {
							type: object.type,
							value: object.value,
							id: object.id,
							parent: object.parent,
							isAvatar: object.isAvatar,
							owner: object.owner,
							lastUpdate: object.lastUpdate
						}
					}));
				}
			}
		}
	}

	/**
	 * Data handler for a Peer instance
	 *
	 * @param {Object} data - Event object for a data handler
	 *
	 * @returns {undefined}
	 *
	 * @private
	 */
	_peerData(data) {
		const string = this.multiUser._decodeBuffer(data);
		data = JSON.parse(string);

		if (data.type === 'update') {
			this.multiUser.update(data, this.id);
		} else if (data.type === 'remove') {
			this.multiUser.remove(data, this.id);
		}
	}

	/**
	 * Close handler for a Peer instance
	 *
	 * @returns {undefined}
	 *
	 * @private
	 *
	 * @emits MultiUser#remove
	 */
	_peerClose() {
		console.log(`peer ${this.id} closing`);
		delete this.multiUser.remotePeers[this.id];
		for (const object of Object.values(this.multiUser.objects)) {
			if (object.owner === this.id) {
				object.owner = '';

				if (object.isAvatar) {
					delete this.multiUser.objects[object.id];

					if (!object.parent.id) {
						const mesh = object.object3D;
						/**
						 * MultiUser remove event that provides a mesh to be removed
						 * from the scene
						 *
						 * @event MultiUser#remove
						 * @type {object}
						 * @property mesh - Mesh to be removed from the scene
						*/
						this.multiUser.emit('remove', {mesh});
					}
				}
			}
		}
	}

	/**
	 * Updates the information about a networked object. If it's not being tracked, it's added
	 *
	 * @param {object} data - Data about the information update
	 * @param {object} data.object - Data about the object
	 * @param {number} data.object.id - The object's id
	 * @param {number} data.object.owner - The owner's peerID
	 * @param {number} data.object.lastUpdate - Date in ms when the object was last updated
	 * @param {array} data.position - Object position
	 * @param {array} data.rotation - Object rotation
	 * @param {array} data.scale - Object scale
	 * @param {object} data.animatedValues - The key to a nested object key with the value to apply
	 * @param {number} peerId - The peer's id who's sending the information
	 *
	 * @returns {undefined}
	 */
	update(data, peerId) {
		if (data.object.owner !== peerId) {
			return;
		}

		if (!this.objects[data.object.id]) {
			if (data.object.type && data.object.value) {
				this.addObject(data.object, peerId);
			} else {
				return;
			}
		}

		const object = this.objects[data.object.id];
		if (object) {
			if (object.owner !== data.object.owner &&
				!this.remotePeers[peerId].initiator &&
				data.firstUpdate) {

				object.owner = data.object.owner;
				object.lastUpdate = data.object.lastUpdate;
			}

			if (data.position) {
				object.position = [...data.position];
			}

			if (data.rotation) {
				object.rotation = [...data.rotation];
			}

			if (data.scale) {
				object.scale = [...data.scale];
			}

			for (const key of Object.keys(data.animatedValues || {})) {
				object.animatedValues[key] = data.animatedValues[key];
			}

			if (typeof data.object.owner !== 'undefined' &&
				typeof data.object.lastUpdate !== 'undefined' &&
				!data.firstUpdate) {

				object.owner = data.object.owner;
				object.lastUpdate = data.object.lastUpdate;
			}
		}
	}

	/**
	 * Removes a networked object
	 *
	 * @param {object} data - Data about the object
	 * @param {object} data.object - Data about the object
	 * @param {number} data.object.id - The object's id
	 * @param {number} data.object.owner - The owner's peerID
	 * @param {number} data.object.isAvatar - Date in ms when the object was last updated
	 * @param {number} peerId - The peer's id who's sending the information
	 *
	 * @returns {undefined}
	 */
	remove(data, peerId) {
		const object = this.objects[data.object.id];
		if (!object || object.owner !== peerId) {
			return;
		}

		object.owner = '';

		if (object.children) {
			for (const childId of object.children) {
				delete this.objects[childId];
			}
		}

		if (object.parent && object.parent.id) {
			this._removeFromParent(object);
		}

		if (object.isAvatar && !object.parent.id) {
			const mesh = object.object3D;
			this.emit('remove', {mesh});
		}

		delete this.objects[object.id];
	}

	/**
	 * Sends data from an object to all peers
	 *
	 * @param {Object} object - Object from where to get the data
	 *
	 * @example
	 * multiUser.sendData(Object.values(multiuser.objects)[0]);
	 *
	 * @returns {undefined}
	 */
	sendData(object) {
		const object3D = object.object3D;
		const payload = {
			type: 'update',
			object: {
				id: object.id,
				owner: object.owner
			},
			position: [object3D.position.x, object3D.position.y, object3D.position.z],
			rotation: [object3D.rotation.x, object3D.rotation.y, object3D.rotation.z],
			scale: [object3D.scale.x, object3D.scale.y, object3D.scale.z],
			animatedValues: {}
		};

		for (const key of Object.keys(object.animatedValues)) {
			payload.animatedValues[key] = getDeepValue(object.object3D, key);
		}

		// const positionBuffer = new ArrayBuffer(16);
		// positionBuffer[0] = object3D.position.x;
		// positionBuffer[1] = object3D.position.y;
		// positionBuffer[2] = object3D.position.z;
		// positionBuffer[3] = object3D.rotation.y;

		this.broadcast(JSON.stringify(payload));
	}

	/**
	 * Sends a piece of data to all peers
	 *
	 * @param {ArrayBuffer|string} data - Data to be shared to other peers
	 *
	 * @example
	 * const data = {};
	 * multiUser.broadcast(JSON.stringify(data));
	 *
	 * @returns {undefined}
	 */
	broadcast(data) {
		for (const peerId of Object.keys(this.remotePeers)) {
			const peer = this.remotePeers[peerId];
			if (peer.connected) {
				peer.send(data);
			}
		}
	}

	/**
	 * Saves the avatar's object and adds it as a networked object
	 *
	 * @param {THREE.Object3D} avatar - The avatar's object
	 *
	 * @returns {undefined}
	 */
	setLocalAvatar(avatar) {
		if (!avatar) {
			return;
		}

		this.localAvatar = avatar;
		this.addObject({
			type: 'Object3D',
			value: this.localAvatar,
			id: this.localAvatar.uuid,
			isAvatar: true,
			owner: 'self'
		}).then(() => {
			const leftHand = this.localAvatar.getObjectByName('VirtualPersonaHandLeft');
			const rightHand = this.localAvatar.getObjectByName('VirtualPersonaHandRight');
			if (leftHand) {
				this.addObject({
					type: 'name',
					value: 'VirtualPersonaHandLeft',
					id: leftHand.uuid,
					isAvatar: true,
					parent: {
						id: this.localAvatar.uuid
					},
					owner: 'self'
				});
			}
			if (rightHand) {
				this.addObject({
					type: 'name',
					value: 'VirtualPersonaHandRight',
					id: rightHand.uuid,
					isAvatar: true,
					parent: {
						id: this.localAvatar.uuid
					},
					owner: 'self'
				});
			}
		}).catch((error) => {
			this.emit('error', error);
		});
	}

	/**
	 * Helper function that adds networked objects that were cached until the socket was open
	 *
	 * @returns {undefined}
	 */
	_addCachedObjects() {
		for (const object of this.cachedObjects) {
			this.addObject(object);
		}
	}

	/**
	 * Helper function to convert an ArrayBuffer to a String
	 *
	 * @param {ArrayBuffer|TypedArray} buffer - ArrayBuffer to be converted
	 *
	 * @returns {string} string
	 *
	 * @private
	 */
	_decodeBuffer(buffer) {
		buffer = buffer.buffer || buffer;
		if (!(buffer instanceof ArrayBuffer)) {
			return buffer;
		}

		let string;

		if ('TextDecoder' in window) {
			if (!this.decoder) {
				this.decoder = new TextDecoder('utf-8');
			}

			const dataView = new DataView(buffer);
			string = this.decoder.decode(dataView);
		} else {
			string = String.fromCharCode.apply(null, new Uint8Array(buffer));
		}

		return string;
	}
}

export {MultiUser};
