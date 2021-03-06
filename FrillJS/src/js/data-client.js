"use strict";

var ReconnectingWebSocket = require('reconnectingwebsocket');

module.exports = function (codeName) {
  var DataClient = {};

  function Peer(name, color) {
    this.id = null;
    this.name = name;
    this.color = color;
  }

  // Consumer should set this to unique names in page if there are multiple clients
  DataClient.codeName = "dc";

  DataClient.color = "red";
  DataClient.me = null;
  DataClient.connected = false;
  DataClient.version = null;
  DataClient.peers = [];

  DataClient.connect = function (name) {
    DataClient.me = new Peer(name, DataClient.color);
    // Create browserchannel socket
    var wsAddr = ((location.protocol === 'https:') ? 'wss' : 'ws') + '://' + window.location.host + '/data';
    //DataClient.socket = new ReconnectingWebSocket(wsAddr);
    DataClient.socket = new WebSocket(wsAddr);
    initSocketHandlers();
  }

  DataClient.disconnect = function () {
    DataClient.socket.close();
    delete DataClient.socket;
    delete DataClient.me;
    DataClient.peers = [];
  }

  // Send my details
  DataClient.sendMyDetails = function () {
    var msgObj = {
      msg: "details",
      data: DataClient.me
    };
    DataClient.socket.send(JSON.stringify(msgObj));
  };

  // Store and send new selection
  DataClient.selectionChanged = function (range) {
    if (!DataClient.me) return;
    DataClient.me.range = range;
    var msgObj = {
      msg: "selection",
      data: DataClient.me.range
    };
    DataClient.socket.send(JSON.stringify(msgObj));
  }

  // Local editor content changed (user input)
  DataClient.contentChanged = function (delta, oldDelta, source) {
    if (source != "user") return;

    if (DataClient.me.range && DataClient.me.range.length) {
      DataClient.me.range.index += DataClient.me.range.length;
      DataClient.me.range.length = 0;
      DataClient.selectionChanged();
    }
    var msgObj = {
      msg: "delta",
      data: delta
    };
    DataClient.socket.send(JSON.stringify(msgObj));
  }

  // Server sent selection update for one peer
  function onMsgSelection(data) {
    console.log("[DataClient] Peer selection received.", data);
    var peer = DataClient.peers.find((p) => { return p.id == data.id; });
    if (!peer) return;
    peer.range = data.range;
    document.dispatchEvent(new CustomEvent('dataclient-cursor-update', {
      detail: {
        sender: DataClient,
        source: peer
      }
    }));
  }

  // Server sent peer list
  function onMsgPeers(data) {
    var source = {};
    var forceSendDetails = false;
    var reportNewPeers = true;

    if (!DataClient.me.id) forceSendDetails = true;
    // Refresh local connection ID (we get it assigned from server)
    DataClient.me.id = data.id;

    if (forceSendDetails) {
      DataClient.sendMyDetails();
      return;
    }

    // Find removed peers
    for (var i = 0; i < DataClient.peers.length; i++) {
      var receivedPeer = data.peers.find((p) => { return p.id == DataClient.peers[i].id; });

      if (!receivedPeer) {
        console.log('[DataClient] Peer disconnected:', DataClient.peers[i]);

        // If the source connection was removed set it
        if (data.sourceId == DataClient.peers[i])
          source = DataClient.peers[i];
      } else if (receivedPeer.name && !DataClient.peers[i].name) {
        console.log('[DataClient] User ' + receivedPeer.id + ' set username:', receivedPeer.name);
        console.log('[DataClient] Peers after username update:', data.peers);
      }
    }

    if (DataClient.peers.length == 0 && data.peers.length != 0) {
      console.log('[DataClient] Initial list of peers received from server:', data.peers);
      reportNewPeers = false;
    }

    for (var i = 0; i < data.peers.length; i++) {
      // Set the source if it's still an active peers
      if (data.sourceId == data.peers[i].id)
        source = data.peers[i];

      if (reportNewPeers && !DataClient.peers.find((p) => { return p.id == data.peers[i].id })) {
        console.log('[DataClient] Peer connected:', data.peers[i]);
        console.log('[DataClient] Peers after new user:', data.peers);
      }
    }

    // Update peers array
    DataClient.peers = data.peers;

    // Tell consumer
    var peerList = [];
    DataClient.peers.forEach((p) => {
      peerList.push({ id: p.id, name: p.name, color: p.color });
    });
    document.dispatchEvent(new CustomEvent('dataclient-peers', {
      detail: {
        sender: DataClient,
        source: source,
        peers: peerList
      }
    }));
  }

  function onMsgContent(data) {
    console.log('[DataClient] Received document content.');
    DataClient.version = data.version;
    document.dispatchEvent(new CustomEvent('dataclient-content', {
      detail: {
        sender: DataClient,
        data: data.content
      }
    }));
  }

  function onMsgDelta(data) {
    console.log('[DataClient] Received document delta.');
    DataClient.version = data.version;
    document.dispatchEvent(new CustomEvent('dataclient-delta', {
      detail: {
        sender: DataClient,
        data: data.delta
      }
    }));
  }

  function initSocketHandlers() {

    // Send initial message to register the client, and
    // retrieve a list of current clients so we can set a colour.
    DataClient.socket.onopen = function () {
      DataClient.connected = true;
      DataClient.sendMyDetails();
      document.dispatchEvent(new CustomEvent('dataclient-connected', {
        detail: {
          sender: DataClient
        }
      }));
    };

    DataClient.socket.onmessage = function (message) {
      var msgObj = JSON.parse(message.data);
      if (msgObj.msg == "peers") onMsgPeers(msgObj.data);
      else if (msgObj.msg == "selection") onMsgSelection(msgObj.data);
      else if (msgObj.msg == "content") onMsgContent(msgObj.data);
      else if (msgObj.msg == "delta") onMsgDelta(msgObj.data);
    };

    DataClient.socket.onclose = function (event) {
      console.log('[DataClient] Socket closed. Event:', event);
      DataClient.connected = false;
      document.dispatchEvent(new CustomEvent('dataclient-disconnected', {
        detail: {
          sender: DataClient
        }
      }));
    };

    DataClient.socket.onerror = function (event) {
      console.log('[DataClient] Error on socket. Event:', event);
    };
  }

  return DataClient;
}

