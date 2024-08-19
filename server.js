// const { Socket } = require("dgram");
const express = require("express");
const { connect } = require("http2");
const path = require("path");

var app = express();
port = 3000;
var server = app.listen(port, () => {
  console.log(`server started at http://localhost:${port}`);
});

const io = require("socket.io")(server);

app.use(express.static(path.join(__dirname, "")));

var userConnections = [];

io.on("connection", (socket) => {
  console.log("socket id is ", socket.id);
  socket.on("userconnect", (data) => {
    console.log("userconnect", data.displayName, data.meetingid);

    var other_users = userConnections.filter(
      (p) => p.meeting_id == data.meetingid
    );

    userConnections.push({
      connectionId: socket.id,
      user_id: data.displayName,
      meeting_id: data.meetingid,
    });

    other_users.forEach((v) => {
      //to => send info to specific id
      socket.to(v.connectionId).emit("inform_others_about_me", {
        other_user_id: data.displayName,
        connId: socket.id,
      });
    });

    socket.emit("inform_me_about_other_user", other_users);
  });
  socket.on("SDPProcess", (data) => {
    socket.to(data.to_connid).emit("SDPProcess", {
      message: data.message,
      from_connid: socket.id,
    });
  });
});
