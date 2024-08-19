// AppProcess handles WebRTC peer connection logic and media stream management
var AppProcess = (function () {
  // State variables for managing connections, streams, and media senders
  var peers_connection_ids = {};
  var peers_connection = [];
  var remote_vid_stream = [];
  var remote_aud_stream = [];
  var local_div;
  var serverProcess;
  var audio;
  var isAudioMute = true;
  var rtp_aud_senders = [];
  var video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var video_st = video_states.None;
  var videoCamTrack;
  var rtp_vid_senders = [];

  // Initialize AppProcess with SDP function and connection ID
  async function _init(SDP_function, my_connid) {
    console.log("Initializing AppProcess with connection ID:", my_connid);
    serverProcess = SDP_function;
    eventProcess();
    local_div = document.getElementById("localVideoPlayer");
  }

  // Set up event listeners for UI controls
  function eventProcess() {
    console.log("Setting up event listeners for UI controls.");
    document
      .getElementById("micMuteUnmute")
      .addEventListener("click", async function () {
        console.log("Mic mute/unmute button clicked.");
        if (!audio) {
          console.log("Audio not initialized. Attempting to load audio.");
          await loadAudio(); // Assuming loadAudio function is defined elsewhere
        }
        if (!audio) {
          alert("Audio permission has not been granted");
          return;
        }
        toggleAudioMute(this);
      });

    document
      .getElementById("videoCamOnOff")
      .addEventListener("click", async function () {
        console.log("Video camera on/off button clicked.");
        await toggleVideoCamera();
      });

    document
      .getElementById("ScreenShareOnOff")
      .addEventListener("click", async function () {
        console.log("Screen share on/off button clicked.");
        await toggleScreenShare();
      });
  }

  // Toggle audio mute/unmute state
  function toggleAudioMute(button) {
    console.log("Toggling audio mute state. Current state:", isAudioMute);
    if (isAudioMute) {
      audio.enabled = true;
      button.innerHTML = "<span class='material-icons'>mic</span>";
      updateMediaSenders(audio, rtp_aud_senders);
      console.log("Audio unmuted.");
    } else {
      audio.enabled = false;
      button.innerHTML = "<span class='material-icons'>mic_off</span>";
      removeMediaSenders(rtp_aud_senders); // Assuming removeMediaSenders function is defined elsewhere
      console.log("Audio muted.");
    }
    isAudioMute = !isAudioMute;
  }

  // Toggle video camera on/off
  async function toggleVideoCamera() {
    console.log("Toggling video camera. Current state:", video_st);
    if (video_st === video_states.Camera) {
      await videoProcess(video_states.None);
      console.log("Video camera turned off.");
    } else {
      await videoProcess(video_states.Camera);
      console.log("Video camera turned on.");
    }
  }

  // Toggle screen sharing on/off
  async function toggleScreenShare() {
    console.log("Toggling screen sharing. Current state:", video_st);
    if (video_st === video_states.ScreenShare) {
      await videoProcess(video_states.None);
      console.log("Screen sharing stopped.");
    } else {
      await videoProcess(video_states.ScreenShare);
      console.log("Screen sharing started.");
    }
  }

  // Check if the connection status is valid
  function connection_status(connection) {
    const status =
      connection &&
      ["new", "connecting", "connected"].includes(connection.connectionState);
    console.log("Connection status:", status);
    return status;
  }

  // Update the media senders for each peer connection
  async function updateMediaSenders(track, rtp_senders) {
    console.log("Updating media senders for track:", track);
    for (let con_id in peers_connection_ids) {
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          console.log(`Replacing track for connection ID: ${con_id}`);
          rtp_senders[con_id].replaceTrack(track);
        } else {
          console.log(`Adding track for connection ID: ${con_id}`);
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      } else {
        console.log(`Skipping connection ID: ${con_id} due to invalid status.`);
      }
    }
  }

  // Handle the video stream processing (Camera/ScreenShare)
  async function videoProcess(newVideoState) {
    console.log("Processing video state change to:", newVideoState);
    console.log(local_div);
    try {
      let vstream = null;
      if (newVideoState === video_states.Camera) {
        console.log("Accessing camera for video stream.");
        vstream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
      } else if (newVideoState === video_states.ScreenShare) {
        console.log("Accessing screen for video stream.");
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
      }

      if (vstream && vstream.getVideoTracks().length > 0) {
        videoCamTrack = vstream.getVideoTracks()[0];
        local_div.srcObject = new MediaStream([videoCamTrack]);
        console.log("Updated local video stream.");
        updateMediaSenders(videoCamTrack, rtp_vid_senders);
      } else {
        console.log("No video tracks found in the stream.");
      }
    } catch (e) {
      console.error("Error during video processing:", e);
    }
    video_st = newVideoState;
  }

  // ICE configuration for peer connections
  var iceConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Set up a new peer connection
  async function setConnection(connid) {
    console.log("Setting up new peer connection for connId:", connid);
    try {
      var connection = new RTCPeerConnection(iceConfiguration);

      connection.onnegotiationneeded = async function () {
        console.log("Negotiation needed for connId:", connid);
        await setOffer(connid);
      };

      connection.onicecandidate = function (event) {
        if (event.candidate) {
          console.log("Sending ICE candidate to connId:", connid);
          serverProcess(
            JSON.stringify({ iceCandidate: event.candidate }),
            connid
          );
        }
      };

      connection.ontrack = function (event) {
        console.log("Received remote track from connId:", connid);
        handleRemoteStream(event, connid);
      };

      peers_connection_ids[connid] = connid;
      peers_connection[connid] = connection;

      if (
        video_st === video_states.Camera ||
        video_st === video_states.ScreenShare
      ) {
        if (videoCamTrack) {
          console.log("Adding video track to connection:", connid);
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }

      return connection;
    } catch (e) {
      console.error("Error setting up peer connection:", e);
    }
  }

  // Handle remote video/audio streams
  function handleRemoteStream(event, connid) {
    console.log("Handling remote stream for connId:", connid);
    if (!remote_vid_stream[connid]) {
      remote_vid_stream[connid] = new MediaStream();
    }
    if (!remote_aud_stream[connid]) {
      remote_aud_stream[connid] = new MediaStream();
    }

    if (event.track.kind === "video") {
      remote_vid_stream[connid]
        .getVideoTracks()
        .forEach((t) => remote_vid_stream[connid].removeTrack(t));
      remote_vid_stream[connid].addTrack(event.track);
      var remoteVideoPlayer = document.getElementById("v_" + connid);
      if (remoteVideoPlayer) {
        remoteVideoPlayer.srcObject = remote_vid_stream[connid];
        console.log("Updated remote video stream for connId:", connid);
      } else {
        console.error("Remote video element not found for connId:", connid);
      }
    } else if (event.track.kind === "audio") {
      remote_aud_stream[connid]
        .getAudioTracks()
        .forEach((t) => remote_aud_stream[connid].removeTrack(t));
      remote_aud_stream[connid].addTrack(event.track);
      var remoteAudioPlayer = document.getElementById("a_" + connid);
      if (remoteAudioPlayer) {
        remoteAudioPlayer.srcObject = remote_aud_stream[connid];
        console.log("Updated remote audio stream for connId:", connid);
      } else {
        console.error("Remote audio element not found for connId:", connid);
      }
    }
  }

  // Create and send an SDP offer
  async function setOffer(connid) {
    console.log("Creating SDP offer for connId:", connid);
    try {
      var connection = peers_connection[connid];
      var offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      serverProcess(
        JSON.stringify({ offer: connection.localDescription }),
        connid
      );
      console.log("Sent SDP offer to connId:", connid);
    } catch (e) {
      console.error("Error creating SDP offer:", e);
    }
  }

  // Process incoming SDP messages
  async function SDPProcess(message, from_connid) {
    console.log("Processing SDP message from connId:", from_connid);
    message = JSON.parse(message);

    if (message.answer) {
      console.log("Received SDP answer from connId:", from_connid);
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      console.log("Received SDP offer from connId:", from_connid);
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );
      var answer = await peers_connection[from_connid].createAnswer();
      await peers_connection[from_connid].setLocalDescription(answer);
      serverProcess(JSON.stringify({ answer: answer }), from_connid);
      console.log("Sent SDP answer to connId:", from_connid);
    } else if (message.iceCandidate) {
      console.log("Adding ICE candidate for connId:", from_connid);
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      try {
        await peers_connection[from_connid].addIceCandidate(
          message.iceCandidate
        );
        console.log("Added ICE candidate for connId:", from_connid);
      } catch (e) {
        console.error("Error adding ICE candidate for connId:", from_connid, e);
      }
    }
  }

  // Public API exposed by AppProcess
  return {
    setConnection: async function (connid) {
      return await setConnection(connid);
    },
    init: async function (SDP_function, my_connid) {
      await _init(SDP_function, my_connid);
    },
    processClientFunc: async function (data, from_connid) {
      await SDPProcess(data, from_connid);
    },
  };
})();

// MyApp handles the main app initialization and signaling server communication
var MyApp = (function () {
  var socket = null;
  var user_id = "";
  var meeting_id = "";

  // Initialize MyApp with user ID and meeting ID
  function init(uid, mid) {
    user_id = uid;
    meeting_id = mid;
    document.getElementById("meetingContainer").style.display = "block";

    var h2Element = document.querySelector("#me h2");
    if (h2Element) {
      h2Element.textContent = user_id + " (Me)";
    }
    document.title = user_id;
    console.log(
      "Initializing MyApp for user:",
      user_id,
      "in meeting:",
      meeting_id
    );
    eventProcessForSignalingServer();
  }

  // Set up event listeners for socket communication
  function eventProcessForSignalingServer() {
    console.log("Setting up event listeners for signaling server.");
    socket = io().connect();

    // Function to process SDP messages
    var SDP_function = function (data, to_connid) {
      console.log("Sending SDP process message to connId:", to_connid);
      socket.emit("SDPProcess", {
        message: data,
        to_connid: to_connid,
      });
    };

    socket.on("connect", function () {
      console.log("Socket connected. ID:", socket.id);
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);
        if (user_id && meeting_id) {
          console.log("Notifying server about user connection.");
          socket.emit("userconnect", {
            displayName: user_id,
            meetingid: meeting_id,
          });
        }
      }
    });

    socket.on("inform_others_about_me", function (data) {
      console.log(
        "Informed others about me. Other user ID:",
        data.other_user_id
      );
      addUser(data.other_user_id, data.connId);
      AppProcess.setConnection(data.connId);
    });

    socket.on("inform_me_about_other_users", function (other_users) {
      console.log("Informed about other users in the meeting.");
      if (other_users) {
        for (let user of other_users) {
          console.log(
            "Adding user:",
            user.user_id,
            "with connId:",
            user.connectionId
          );
          addUser(user.user_id, user.connectionId);
          AppProcess.setConnection(user.connectionId);
        }
      }
    });

    socket.on("SDPProcess", async function (data) {
      console.log("Received SDP process message.");
      await AppProcess.processClientFunc(data.message, data.from_connid);
    });
  }

  // Add a new user to the user interface
  function addUser(other_user_id, connId) {
    console.log(
      "Adding user to the UI:",
      other_user_id,
      "with connId:",
      connId
    );
    var template = document.getElementById("otherTemplate");

    if (!template) {
      console.error("Template element not found.");
      return;
    }

    var newDivId = template.cloneNode(true);
    newDivId.id = connId;
    newDivId.classList.add("other");

    var h2Element = newDivId.querySelector("h2");
    if (h2Element) {
      h2Element.textContent = other_user_id;
    }

    var videoElement = newDivId.querySelector("video");
    if (videoElement) {
      videoElement.id = "v_" + connId;
    }

    var audioElement = newDivId.querySelector("audio");
    if (audioElement) {
      audioElement.id = "a_" + connId;
    }

    newDivId.style.display = "block";

    var divUsers = document.getElementById("divUsers");
    if (divUsers) {
      divUsers.appendChild(newDivId);
      console.log("User added to the UI successfully.");
    } else {
      console.error("Container for users not found.");
    }
  }

  // Public API exposed by MyApp
  return {
    _init: function (uid, mid) {
      init(uid, mid);
    },
  };
})();
