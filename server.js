// Import necessary modules
const express = require("express");
const path = require("path");
const socketIO = require("socket.io");

// Initialize Express app
const app = express();
const port = 3000;

// Serve static files from the root directory
app.use(express.static(path.join(__dirname, "")));

// Start the server and listen on the specified port
const server = app.listen(port, () => {
  console.log(`Server started at http://localhost:${port}`);
});

// Initialize Socket.IO with the server instance
const io = socketIO(server);

// Array to keep track of user connections
let userConnections = [];

// Handle Socket.IO connections
io.on("connection", (socket) => {
  console.log("Socket ID is", socket.id);

  // Handle 'userconnect' event when a user joins the meeting
  socket.on("userconnect", (data) => {
    console.log("User connected:", data.displayName, data.meetingid);

    // Get the list of other users in the same meeting
    const otherUsers = userConnections.filter(
      (p) => p.meeting_id === data.meetingid
    );

    console.log("Other users:", otherUsers);

    // Add the current user to the userConnections array
    userConnections.push({
      connectionId: socket.id,
      user_id: data.displayName,
      meeting_id: data.meetingid,
    });

    // Notify other users in the meeting about the new user
    otherUsers.forEach((user) => {
      console.log("Notifying the user:", user);
      socket.to(user.connectionId).emit("inform_others_about_me", {
        other_user_id: data.displayName,
        connId: socket.id,
      });
    });

    // Send the current user information about the other users in the meeting
    socket.emit("inform_me_about_other_users", otherUsers);
  });

  // Handle SDP processing for WebRTC connections
  socket.on("SDPProcess", (data) => {
    console.log("SDPProcess", data);
    socket.to(data.to_connid).emit("SDPProcess", {
      message: data.message,
      from_connid: socket.id,
    });
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Find the meeting ID of the disconnected user
    const disconnectedUser = userConnections.find(
      (user) => user.connectionId === socket.id
    );

    // Remove the user from the userConnections array
    userConnections = userConnections.filter(
      (user) => user.connectionId !== socket.id
    );

    // If the disconnected user was part of a meeting, notify others
    if (disconnectedUser) {
      const remainingUsers = userConnections.filter(
        (user) => user.meeting_id === disconnectedUser.meeting_id
      );

      remainingUsers.forEach((user) => {
        socket.to(user.connectionId).emit("user_left", {
          connId: socket.id,
        });
      });
    }
  });
});
