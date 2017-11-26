"use strict";

var WebSocket = require('ws');
var uuid = require('uuid');
var debug = require('debug')('FrillJS:ws-server');

module.exports = function (server) {

  const wss = new WebSocket.Server({ noServer: true });
  const conns = [];

  function broadcastPeerList(sourceId) {
    // Peer's details: subset of stuff we have in conns
    var peers = [];
    conns.forEach((conn) => {
      peers.push({
        id: conn.ws.id,
        name: conn.name,
        color: conn.color
      });
    });
    // Send to every connection
    conns.forEach((conn) => {
      if (conn.ws.readyState != conn.ws.OPEN) return;
      var msgObj = {
        msg: "peers",
        data: {
          id: conn.ws.id,
          sourceId: sourceId,
          peers: peers
        }
      };
      conn.ws.send(JSON.stringify(msgObj));
    });
  }


  function onMsgDetails(ws, data) {
    debug('MSG <peers> received:\n%O', data);

    // No connection ID: we just return it now as "peers"
    if (!data.id) {
      var msgObj = {
        msg: "peers",
        data: {
          id: ws.id,
          sourceId: ws.id,
          connections: []
        }
      };
      ws.send(JSON.stringify(msgObj));
      return;
    }

    // New connection or known?
    var conn = conns.find((c) => { return c.id == ws.id; });
    // New connection.
    if (!conn) {
      // Remember
      conns.push({
        ws: ws,
        name: data.name,
        color: data.color
      });
    }
    // Known connection: update details
    else {
      conn.name = data.name;
      conn.color = data.color;
    }
    // Notify everyone
    broadcastPeerList(ws.id);
  }

  function onMsgSelection(ws, data) {
    debug('MSG <selection> received:\n%O', data);

    // Notify everyone, except sender
    var msgObj = {
      msg: "selection",
      data: {
        id: ws.id,
        range: data
      }
    };
    var msgStr = JSON.stringify(msgObj);
    conns.forEach((conn) => {
      if (conn.ws.readyState != conn.ws.OPEN) return;
      if (conn.ws.id == ws.id) return;
      conn.ws.send(msgStr);
    });
  }

  function onMessage(ws, message) {
    var msgObj = JSON.parse(message);
    if (msgObj.msg == "details") onMsgDetails(ws, msgObj.data);
    if (msgObj.msg == "selection") onMsgSelection(ws, msgObj.data);
  }

  function onClose(ws, code, reason) {
    debug('Client connection closed (%s).\nCode: %s, Reason: %s', ws.id, code, reason);

    // Forget
    var ix = conns.findIndex((x) => x.ws.id == ws.id);
    // Should never happen
    if (ix == -1) return;
    debug('Removing connection.');
    conns.splice(ix, 1);
    // Notify everyone
    broadcastPeerList(ws.id);
  }

  function onError(ws, error) {
    debug('Error on connection (%s).\nError: %s', ws.id, error);

    // Which one?
    var ix = conns.findIndex((x) => x.ws.id == ws.id);
    if (ix == -1) return;
    debug('Connection details:\n%O', conns[ix]);
  }

  function onPong(ws, data, flags) {
    debug('Pong received. (%s)', ws.id);
    ws.isAlive = true;
  }

  wss.on('connection', function (ws, req) {
    ws.id = uuid();
    ws.isAlive = true;
    debug('New connection. Assigned ID: %s.', ws.id);

    // Socket's event handlers
    ws.on('message', (data) => onMessage(ws, data));
    ws.on('close', (code, reason) => onClose(ws, code, reason));
    ws.on('error', (error) => onError(ws, error));
    ws.on('pong', (data, flags) => onPong(ws, data, flags));
  });

  // Ping, keepalive
  setInterval(function () {
    wss.clients.forEach(function (ws) {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping('', false, true);
      debug('Ping sent. (%s)', ws.id);
    });
  }, 30000);

  // Done. Our export is the socket server itself.
  return wss;
};
