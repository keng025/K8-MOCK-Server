const WebSocketServer = require("./WebSocketServer");

function buildWSServer(services, useSSL) {
  const Server = function (port) {
    WebSocketServer.call(this, port, useSSL);
    services.forEach((Service) => this.addService(new Service()));
  };

  Server.prototype = Object.create(WebSocketServer.prototype);
  Server.prototype.constructor = Server;

  return Server;
}

module.exports = {
  buildWSServer: buildWSServer
};
