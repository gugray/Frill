"use strict";

var ShareDB = require('sharedb');
var WebSocket = require('ws');
var uuid = require('uuid');
var debug = require('debug')('FrillJS:ws-server');

module.exports = function (server) {

  ShareDB.types.register(require('rich-text').type);
  const dbOpt = {
    db: ShareDB.MemoryDB(),
    //db: require('sharedb-mongo')(process.env.MONGODB_URI || 'mongodb://localhost/quill-sharedb-cursors?auto_reconnect=true'),
    pubsub: ShareDB.MemoryPubSub()
  };

  const sharedb = new ShareDB(dbOpt);
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
      if (ws.readyState != ws.OPEN) return;
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

  function onMsgDelta(ws, data) {
    debug('MSG <delta> received:\n%O', data);

    // Feed into ShareDB. Connections will all receive their notifs.
    ws.dbdoc.submitOp(data, function (err) {
      if (err) debug('ShareDB submit failed:', err);
    });
  }

  function onDocSubscribed(ws, err) {
    if (err) {
      debug('Failed to subscribe to document. Error: %s', err);
      throw err;
    }
    if (!ws.dbdoc.type) {
      debug('Document type missing; creating document now.');
      ws.dbdoc.create([{
        insert: '\n'
      }], 'rich-text');
    }
    // Send doc's content to client
    var msgObj = {
      msg: "content",
      data: {
        content: ws.dbdoc.data,
        version: ws.dbdoc.version
      }
    };
    if (ws.readyState != ws.OPEN) return;
    ws.send(JSON.stringify(msgObj));
    debug('Sent document content to client.');
    // Subscribe to deltas
    ws.dbdoc.on('op', function (op, source) {
      if (source) return; // So we don't send delta straight back to the submitter.

      var msgObj = {
        msg: "delta",
        data: {
          delta: op,
          version: ws.dbdoc.version
        }
      };
      if (ws.readyState != ws.OPEN) return;
      ws.send(JSON.stringify(msgObj));
    });
    debug('Subscribed to ShareDB doc deltas.');
  }

  function onMessage(ws, message) {
    var msgObj = JSON.parse(message);
    if (msgObj.msg == "details") onMsgDetails(ws, msgObj.data);
    if (msgObj.msg == "selection") onMsgSelection(ws, msgObj.data);
    if (msgObj.msg == "delta") onMsgDelta(ws, msgObj.data);
  }

  function onClose(ws, code, reason) {
    debug('Client connection closed (%s).\nCode: %s, Reason: %s', ws.id, code, reason);

    // Unsubscribe document
    if (ws.dbdoc) {
      ws.dbdoc.destroy();
      delete ws.dbdoc;
    }
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
    // Assign new ID
    ws.id = uuid();
    ws.isAlive = true;
    debug('New connection. Assigned ID: %s.', ws.id);
    // Create a ShareDB client for this connection
    ws.dbconn = sharedb.connect();
    ws.dbdoc = ws.dbconn.get('frilldocs', 'docxyz');
    debug('ShareDB connection created and document retrieved.');
    ws.dbdoc.subscribe((err) => onDocSubscribed(ws, err));

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
