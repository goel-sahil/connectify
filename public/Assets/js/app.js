var AppProcess = (function () {
  var peers_connection_ids = [];
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
  async function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connid = my_connid; // Corrected variable name
    eventProcess();
    local_div = document.getElementById("localVideoPlayer");
  }

  function eventProcess() {
    document
      .getElementById("micMuteUnmute")
      .addEventListener("click", async function () {
        if (!audio) {
          await loadAudio(); // Afssuming loadAudio function is defined elsewhere
        }
        if (!audio) {
          alert("Audio permission has not been granted");
          return;
        }
        if (isAudioMute) {
          audio.enabled = true;
          this.innerHTML = "<span class='material-icons'>mic</span>";
          updateMediaSenders(audio, rtp_aud_senders);
        } else {
          audio.enabled = false;
          this.innerHTML = "<span class='material-icons'>mic_off</span>";
          removeMediaSenders(rtp_aud_senders); // Assuming removeMediaSenders function is defined elsewhere
        }
        isAudioMute = !isAudioMute;
      });

    document
      .getElementById("videoCamOnOff")
      .addEventListener("click", async function () {
        if (video_st === video_states.Camera) {
          await videoProcess(video_states.None);
        } else {
          await videoProcess(video_states.Camera);
        }
      });

    document
      .getElementById("ScreenShareOnOff")
      .addEventListener("click", async function () {
        if (video_st === video_states.ScreenShare) {
          await videoProcess(video_states.None);
        } else {
          await videoProcess(video_states.ScreenShare);
        }
      });
  }

  function connection_status(connection) {
    return (
      connection &&
      ["new", "connecting", "connected"].includes(connection.connectionState)
    );
  }

  async function updateMediaSenders(track, rtp_senders) {
    for (let con_id of peers_connection_ids) {
      // Changed var to let
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          rtp_senders[con_id].replaceTrack(track);
        } else {
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      }
    }
  }

  async function videoProcess(newVideoState) {
    try {
      let vstream = null;
      if (newVideoState === video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
      } else if (newVideoState === video_states.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1920, height: 1080 },
          audio: false,
        });
      }
      if (vstream && vstream.getVideoTracks().length > 0) {
        videoCamTrack = vstream.getVideoTracks()[0];
        if (videoCamTrack) {
          local_div.srcObject = new MediaStream([videoCamTrack]);
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }
    } catch (e) {
      console.error(e);
      return;
    }
    video_st = newVideoState;
  }

  var iceConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  async function setConnection(connid) {
    try {
      var connection = new RTCPeerConnection(iceConfiguration);

      connection.onnegotiationneeded = async function () {
        await setOffer(connid);
      };

      connection.onicecandidate = function (event) {
        if (event.candidate) {
          serverProcess(
            JSON.stringify({ iceCandidate: event.candidate }),
            connid
          );
        }
      };

      connection.ontrack = function (event) {
        console.log("ontrack event triggered for", connid);
        console.log("Track details:", event.track);

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
          } else {
            console.error("Remote audio element not found for connId:", connid);
          }
        }
      };

      peers_connection_ids[connid] = connid;
      peers_connection[connid] = connection;

      if (
        video_st === video_states.Camera ||
        video_st === video_states.ScreenShare
      ) {
        if (videoCamTrack) {
          updateMediaSenders(videoCamTrack, rtp_vid_senders);
        }
      }

      return connection;
    } catch (e) {
      console.error(e);
    }
  }

  async function setOffer(connid) {
    try {
      var connection = peers_connection[connid];
      var offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      serverProcess(
        JSON.stringify({ offer: connection.localDescription }),
        connid
      );
    } catch (e) {
      console.error(e);
    }
  }

  async function SDPProcess(message, from_connid) {
    try {
      message = JSON.parse(message);
      if (message.answer) {
        await peers_connection[from_connid].setRemoteDescription(
          new RTCSessionDescription(message.answer)
        );
      } else if (message.offer) {
        if (!peers_connection[from_connid]) {
          await setConnection(from_connid);
        }
        await peers_connection[from_connid].setRemoteDescription(
          new RTCSessionDescription(message.offer)
        );
        var answer = await peers_connection[from_connid].createAnswer();
        await peers_connection[from_connid].setLocalDescription(answer);
        serverProcess(JSON.stringify({ answer: answer }), from_connid);
      } else if (message.icecandidate) {
        if (!peers_connection[from_connid]) {
          await setConnection(from_connid);
        }
        await peers_connection[from_connid].addIceCandidate(
          message.icecandidate
        );
      }
    } catch (e) {
      console.error(e);
    }
  }

  return {
    setConnection: async function (connid) {
      await setConnection(connid);
    },
    init: async function (SDP_function, my_connid) {
      await _init(SDP_function, my_connid);
    },
    processClientFunc: async function (data, from_connid) {
      await SDPProcess(data, from_connid);
    },
  };
})();

var MyApp = (function () {
  var socket = null;
  var user_id = "";
  var meeting_id = "";

  function init(uid, mid) {
    user_id = uid;
    meeting_id = mid;
    document.getElementById("meetingContainer").style.display = "block";

    var h2Element = document.querySelector("#me h2");
    if (h2Element) {
      h2Element.textContent = user_id + "(Me)";
    }
    document.title = user_id;
    eventProcessForSignalingServer();
  }

  function eventProcessForSignalingServer() {
    socket = io().connect();

    var SDP_function = function (data, to_connid) {
      socket.emit("SDPProcess", {
        message: data,
        to_connid: to_connid,
      });
    };

    socket.on("connect", function () {
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id);
        if (user_id && meeting_id) {
          socket.emit("userconnect", {
            displayName: user_id,
            meetingid: meeting_id,
          });
        }
      }
    });

    socket.on("inform_others_about_me", function (data) {
      addUser(data.other_user_id, data.connId);
      AppProcess.setConnection(data.connId); // Changed to setConnection
    });

    socket.on("inform_me_about_other_users", function (other_users) {
      if (other_users) {
        for (let user of other_users) {
          // Changed var to let
          addUser(user.user_id, user.connectionId);
          AppProcess.setConnection(user.connectionId); // Changed to setConnection
        }
      }
    });

    socket.on("SDPProcess", async function (data) {
      await AppProcess.processClientFunc(data.message, data.from_connid);
    });
  }

  function addUser(other_user_id, connId) {
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
    } else {
      console.error("Container for users not found.");
    }
  }

  return {
    _init: function (uid, mid) {
      init(uid, mid);
    },
  };
})();
