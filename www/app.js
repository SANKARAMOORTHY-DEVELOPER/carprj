/* globals attachMediaStream, Vue,  peers, localMediaStream, dataChannels, signalingSocket */

"use strict";

const App = Vue.createApp({
	data() {
		return {
			peerId: "",
			roomId: "",
			roomLink: "",
			copyText: "",
			userAgent: "",
			isMobileDevice: false,
			isTablet: false,
			isIpad: false,
			isDesktop: false,
			videoDevices: [],
			audioDevices: [],
			audioEnabled: true,
			videoEnabled: true,
			screenShareEnabled: false,
			showChat: false,
			showSettings: false,
			hideToolbar: true,
			selectedAudioDeviceId: "",
			selectedVideoDeviceId: "",
			name: window.localStorage.name,
			nameError: false,
			typing: "",
			chats: [],
			callInitiated: false,
			callEnded: false,
		};
	},
	methods: {
		initiateCall() {
			if (this.name) {
				this.callInitiated = true;
				window.initiateCall();
			} else {
				this.nameError = true;
			}
		},
		copyURL() {
			navigator.clipboard.writeText(this.roomLink).then(
				() => {
					this.copyText = "Copied 👍";
					setTimeout(() => (this.copyText = ""), 3000);
				},
				(err) => console.error(err)
			);
		},
		audioToggle(e) {
			e.stopPropagation();
			localMediaStream.getAudioTracks()[0].enabled = !localMediaStream.getAudioTracks()[0].enabled;
			this.audioEnabled = !this.audioEnabled;
			this.updateUserData("audioEnabled", this.audioEnabled);
		},
		videoToggle(e) {
			e.stopPropagation();
			localMediaStream.getVideoTracks()[0].enabled = !localMediaStream.getVideoTracks()[0].enabled;
			this.videoEnabled = !this.videoEnabled;
			this.updateUserData("videoEnabled", this.videoEnabled);
		},
		toggleSelfVideoMirror() {
			document.querySelector("#videos .video #selfVideo").classList.toggle("mirror");
		},
		updateName() {
			window.localStorage.name = this.name;
		},
		updateNameAndPublish() {
			window.localStorage.name = this.name;
			this.updateUserData("peerName", this.name);
		},
		screenShareToggle(e) {
			e.stopPropagation();
			let screenMediaPromise;
			if (!App.screenShareEnabled) {
				if (navigator.getDisplayMedia) {
					screenMediaPromise = navigator.getDisplayMedia({ video: true });
				} else if (navigator.mediaDevices.getDisplayMedia) {
					screenMediaPromise = navigator.mediaDevices.getDisplayMedia({ video: true });
				} else {
					screenMediaPromise = navigator.mediaDevices.getUserMedia({
						video: { mediaSource: "screen" },
					});
				}
			} else {
				screenMediaPromise = navigator.mediaDevices.getUserMedia({ video: true });
				document.getElementById(this.peerId + "_videoEnabled").style.visibility = "hidden";
			}
			screenMediaPromise
				.then((screenStream) => {
					App.screenShareEnabled = !App.screenShareEnabled;

					this.videoEnabled = true;
					this.updateUserData("videoEnabled", this.videoEnabled);

					for (let peer_id in peers) {
						const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
						sender.replaceTrack(screenStream.getVideoTracks()[0]);
					}
					screenStream.getVideoTracks()[0].enabled = true;
					const newStream = new MediaStream([screenStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
					localMediaStream = newStream;
					attachMediaStream(document.getElementById("selfVideo"), newStream);
					this.toggleSelfVideoMirror();

					screenStream.getVideoTracks()[0].onended = function () {
						if (App.screenShareEnabled) App.screenShareToggle();
					};
					try {
						if (cabin) {
							cabin.event("screen-share-"+App.screenShareEnabled);
						}
					} catch (e) {}			
				})
				.catch((e) => {
					alert("Unable to share screen. Please use a supported browser.");
					console.error(e);
				});
		},
		updateUserData(key, value) {
			this.sendDataMessage(key, value);

			switch (key) {
				case "audioEnabled":
					document.getElementById(this.peerId + "_audioEnabled").className =
						"audioEnabled icon-mic" + (value ? "" : "-off");
					break;
				case "videoEnabled":
					document.getElementById(this.peerId + "_videoEnabled").style.visibility = value ? "hidden" : "visible";
					break;
				case "peerName":
					document.getElementById(this.peerId + "_videoPeerName").innerHTML = value + " (you)";
					break;
				default:
					break;
			}
		},
		changeCamera(deviceId) {
			navigator.mediaDevices
				.getUserMedia({ video: { deviceId: deviceId } })
				.then((camStream) => {
					console.log(camStream);

					this.videoEnabled = true;
					this.updateUserData("videoEnabled", this.videoEnabled);

					for (let peer_id in peers) {
						const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "video" : false));
						sender.replaceTrack(camStream.getVideoTracks()[0]);
					}
					camStream.getVideoTracks()[0].enabled = true;

					const newStream = new MediaStream([camStream.getVideoTracks()[0], localMediaStream.getAudioTracks()[0]]);
					localMediaStream = newStream;
					attachMediaStream(document.getElementById("selfVideo"), newStream);
					this.selectedVideoDeviceId = deviceId;
				})
				.catch((err) => {
					console.log(err);
					alert("Error while swaping camera");
				});
		},
		changeMicrophone(deviceId) {
			navigator.mediaDevices
				.getUserMedia({ audio: { deviceId: deviceId } })
				.then((micStream) => {
					this.audioEnabled = true;
					this.updateUserData("audioEnabled", this.audioEnabled);

					for (let peer_id in peers) {
						const sender = peers[peer_id].getSenders().find((s) => (s.track ? s.track.kind === "audio" : false));
						sender.replaceTrack(micStream.getAudioTracks()[0]);
					}
					micStream.getAudioTracks()[0].enabled = true;

					const newStream = new MediaStream([localMediaStream.getVideoTracks()[0], micStream.getAudioTracks()[0]]);
					localMediaStream = newStream;
					attachMediaStream(document.getElementById("selfVideo"), newStream);
					this.selectedAudioDeviceId = deviceId;
				})
				.catch((err) => {
					console.log(err);
					alert("Error while swaping microphone");
				});
		},
		sanitizeString(str) {
			const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
			const replaceTag = (tag) => tagsToReplace[tag] || tag;
			const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
			return safe_tags_replace(str);
		},
		linkify(str) {
			return this.sanitizeString(str).replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
				let displayURL = match.trim().replace("https://", "").replace("https://", "");
				displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
				const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
				return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
			});
		},
		edit(e) {
			this.typing = e.srcElement.textContent;
		},
		paste(e) {
			e.preventDefault();
			const clipboardData = e.clipboardData || window.clipboardData;
			const pastedText = clipboardData.getData("Text");
			document.execCommand("inserttext", false, pastedText.replace(/(\r\n\t|\n|\r\t)/gm, " "));
		},
		sendChat(e) {
			e.stopPropagation();
			e.preventDefault();

			if (!this.typing.length) return;

			if (Object.keys(peers).length > 0) {
				const composeElement = document.getElementById("compose");
				this.sendDataMessage("chat", this.typing);
				this.typing = "";
				composeElement.textContent = "";
				composeElement.blur;
			} else {
				alert("No peers in the room");
			}
		},
		sendDataMessage(key, value) {
			const dataMessage = {
				type: key,
				name: this.name,
				id: this.peerId,
				message: value,
				date: new Date().toISOString(),
			};

			switch (key) {
				case "chat":
					this.chats.push(dataMessage);
					this.$nextTick(this.scrollToBottom);
					break;
				default:
					break;
			}

			Object.keys(dataChannels).map((peer_id) => dataChannels[peer_id].send(JSON.stringify(dataMessage)));
		},
		handleIncomingDataChannelMessage(dataMessage) {
			switch (dataMessage.type) {
				case "chat":
					this.showChat = true;
					this.hideToolbar = false;
					this.chats.push(dataMessage);
					this.$nextTick(this.scrollToBottom);
					break;
				case "audioEnabled":
					document.getElementById(dataMessage.id + "_audioEnabled").className =
						"audioEnabled icon-mic" + (dataMessage.message ? "" : "-off");
					break;
				case "videoEnabled":
					document.getElementById(dataMessage.id + "_videoEnabled").style.visibility = dataMessage.message
						? "hidden"
						: "visible";
					break;
				case "peerName":
					document.getElementById(dataMessage.id + "_videoPeerName").innerHTML = dataMessage.message;
					break;
				default:
					break;
			}
		},
		scrollToBottom() {
			const chatContainer = this.$refs.chatContainer;
			chatContainer.scrollTop = chatContainer.scrollHeight;
		},
		formatDate(dateString) {
			const date = new Date(dateString);
			const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
			return (
				(hours < 10 ? "0" + hours : hours) +
				":" +
				(date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
				" " +
				(date.getHours() >= 12 ? "PM" : "AM")
			);
		},
		setStyle(key, value) {
			document.documentElement.style.setProperty(key, value);
		},
		onCallFeedback(e) {
			try {
				if (cabin) {
					cabin.event(e.target.getAttribute("data-cabin-event"));
				}
			} catch (e) {}
		},
		exit() {
			signalingSocket.close();
			for (let peer_id in peers) {
				peers[peer_id].close();
			}
			this.callEnded = true;
		},
	},
}).mount("#app");
