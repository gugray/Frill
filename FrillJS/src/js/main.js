"use strict";

var utils = require('./utils');
var dc1 = require('./data-client')();
dc1.codeName = "dc1";
var dc2 = require('./data-client')();
dc2.codeName = "dc2";
var q1, q2;     // Quill instances
var cm1, cm2;   // Cursors modules

var quillParams = {
  theme: 'snow',
  modules: {
    cursors: {
      autoRegisterListener: false
    },
    history: {
      userOnly: true
    }
  },
  readOnly: true
};

$(document).ready(function () {
  Quill.register('modules/cursors', QuillCursors);
  q1 = new Quill('#editorL', quillParams);
  q2 = new Quill('#editorR', quillParams);
  $(".editorWrap").removeClass("hidden");
  wireupConnectEvents([[dc1, $(".half.left")], [dc2, $(".half.right")]]);
  wireupCursors();
});

function wireupCursors() {
  cm1 = q1.getModule("cursors");
  cm1.registerTextChangeListener();
  cm2 = q2.getModule("cursors");
  cm2.registerTextChangeListener();

  //var debouncedSendCursorData = utils.debounce(function () {
  //  var r1 = q1.getSelection();
  //  if (r1) {
  //    console.log('[shuang] Stopped typing, sending a cursor update/refresh.');
  //    sendCursorData(r1);
  //  }
  //  var r2 = q2.getSelection();
  //  if (r2) {
  //    console.log('[shuang] Stopped typing, sending a cursor update/refresh.');
  //    sendCursorData(r2);
  //  }
  //}, 1500);
  //doc.on('nothing pending', debouncedSendCursorData);

  q1.on('selection-change', function (range, oldRange, source) {
    dc1.selectionChanged(range);
  });

  q2.on('selection-change', function (range, oldRange, source) {
    dc2.selectionChanged(range);
  });

  document.addEventListener('dataclient-cursor-update', function (e) {
    if (e.detail.sender.codeName == "dc1")
      updateCursors(e.detail.source, cm1, dc1);
    else if (e.detail.sender.codeName == "dc2")
      updateCursors(e.detail.source, cm2, dc2);
  });
}


function updateCursors(source, cm, dc) {
  var activePeers = {};
  // If cursors module has no cursors yet, time to show them all.
  // Otherwise, only update sender's cursor.
  var updateAll = Object.keys(cm.cursors).length == 0;

  dc.peers.forEach((peer) => {
    if (peer.id == dc.me.id) return;
    // Update cursor that sent the update, or update all if we're initializing
    if ((peer.id == source.id || updateAll) && peer.range) {
      cm.setCursor(peer.id, peer.range, peer.name, peer.color);
    }
    // Seen, hence active
    activePeers[peer.id] = peer;
  });

  // Clear cursors if peer is gone
  Object.keys(cm.cursors).forEach((id) => {
    if (!activePeers[id]) {
      cm.removeCursor(id);
    }
  });
}


function wireupConnectEvents(clients) {
  clients.forEach((x) => {
    var dc = x[0];
    var elm = x[1];
    var elmButton = elm.find(".connect input[type='button']");
    elmButton.click(function () {
      if ($(this).hasClass("disabled")) return;
      if (dc.connected) dc.disconnect();
      else {
        var name = elm.find(".connect input[type='text']").val();
        var color = dc.codeName == "dc1" ? "red" : "blue";
        dc.connect(name, color);
      }
      $(this).addClass("disabled");
    });
  });
  document.addEventListener("dataclient-connected", function (e, f) {
    var elmBtn = null;
    if (e.detail.sender.codeName == "dc1") {
      elmBtn = $(".half.left .connect input[type='button']");
      q1.enable();
      updateCursors(dc1.me, cm1, dc1);
    }
    else {
      elmBtn = $(".half.right .connect input[type='button']");
      q2.enable();
      updateCursors(dc2.me, cm2, dc2);
    }
    elmBtn.attr("value", "Disconnect");
    elmBtn.removeClass("disabled");
  });
  document.addEventListener("dataclient-disconnected", function (e) {
    var elmBtn;
    if (e.detail.sender.codeName == "dc1") {
      elmBtn = $(".half.left .connect input[type='button']");
      q1.disable();
    }
    else {
      elmBtn = $(".half.right .connect input[type='button']");
      q2.disable();
    }
    elmBtn.attr("value", "Connect");
    elmBtn.removeClass("disabled");
  });
  document.addEventListener("dataclient-peers", function (e) {
    if (e.detail.sender.codeName == "dc1")
      updateCursors(e.detail.source, cm1, dc1);
    else if (e.detail.sender.codeName == "dc2")
      updateCursors(e.detail.source, cm2, dc2);
  });

}

