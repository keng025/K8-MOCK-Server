const ws = require("ws");
const fs = require("fs");

//客户端与服务端通信规则:
// 使用Json对象进行传输,
// {"service": "aService", "functionName": "get", "data": null}

/**
 * 用于封装WebSocket, 可用于注册Service, 并将收到的消息分发给对应的Service.
 * @param {Number} port 监听端口
 * @constructor
 */
const WebSocketServer = function (port, useSSL) {
  //server services
  this._services = [];
  //client services to call client api
  this._clientServices = [];
  //todo::remove clients
  this._clients = [];
  this.port = port;
  this.useSSL = useSSL;
  //todo::remove connection
  this._connection = null;
  //websocket server
  this._wss = null;
  //if need authentication for connection
  this._needAuth = false;
  //message web socket client
  this._messageClient = null;
};

const proto = WebSocketServer.prototype;

const tempParam = {};
let fileToTransferToFTP;

/**
 * Set message web socket client
 */
proto.setMessageClient = function (client) {
  this._messageClient = client;
};

proto.getMessageClient = function () {
  return this._messageClient;
};

/**
 * Set server authentication flag
 */
proto.setAuth = function (bAuth) {
  this._needAuth = bAuth;
};

/**
 * Handle server received message
 * Dispatch message data to correspoding service and function
 */
proto._dispatch = function (conn, message, bClient) {
  const setting = {
    2: "https://mgb.snapplog.com/upload/app/c4c6daddab7abcfc33570aa3a99e31c1app-xbet-release.apk",
    7: ":https://mgb.snapplog.com/upload/app/d4b2a2d8b12af335cfccec1d2d60bcfaapp-xdl-release.apk",
    4: "https://mgb.snapplog.com/upload/app/0d0d7018f2c0b14382e8e66303b9768dapp-eu-release.apk",
    5: "https://mgb.snapplog.com/upload/app/de390974b840559c4a2d75ef0399f719app-byl-release.apk",
    6: "https://mgb.snapplog.com/upload/app/498a76d501c5f4e7eeec510dbf9a4975app-jbl-release.apk",
    8: "https://mgb.snapplog.com/upload/app/9ae8b93b6b3e1ed1105664c1d071e11aapp-jsh-release.apk",
  };

  const serviceName = message["service"],
    funcName = message["functionName"],
    data = message["data"],
    requestId = message["requestId"];

  let platformId = Number(data.platformId);
  if (
    serviceName === "platform" &&
    funcName === "getFrontEndData" &&
    setting[data.platformId]
  ) {
    let result = {
      service: serviceName,
      requestId: requestId,
      functionName: funcName,
      data: {
        data: {
          setting: {
            appleMinVersion: "20.3.1",
            appleDownloadUrl: "",
            androidMinVersion: "20.3.1",
            codePushPop: true,
            androidDownloadUrl: setting[platformId],
          },
        },
        status: 200,
      },
    };
    result.data.data = JSON.stringify(result.data.data);
    console.log(result);
    conn.send(JSON.stringify(result));
  } else {
    let data = funcName === "getRewardList" ? [] : {};
    data = funcName === "authenticate" ? null : {};
    let result = {
      service: serviceName,
      functionName: funcName,
      requestId: requestId,
      data: {
        status: funcName === "authenticate" ? 400 : 403,
        errorMessage: "INVALID DATA",
        data: data,
      },
    };
    if (funcName === "authenticate") {
      console.log("result", result);
    }

    conn.send(JSON.stringify(result));
  }
};

proto.close = function () {
  this._wss.close();
};

/**
 * 运行服务器
 */
proto.run = function (restfulServer) {
  if (this._wss) {
    console.log("The server is running.");
    return;
  }

  if (this.useSSL) {
    let sslKey = "../ssl/server.key";
    let sslCert = "../ssl/server.crt";
    let httpServ = require("https");
    // dummy request processing
    let processRequest = function (req, res) {
      res.writeHead(200);
      res.end("WebSockets!\n");
    };
    let app = httpServ
      .createServer(
        {
          // providing server with  SSL key/cert
          key: fs.readFileSync(sslKey),
          cert: fs.readFileSync(sslCert),
        },
        processRequest
      )
      .listen(this.port);
    this._wss = new ws.Server({ server: app });
    if (restfulServer) {
      app.on("request", restfulServer);
    }
    app.listen(this.port, function () {
      console.log(`RESTFUL API USING SSL listening on port ${this.port}.`);
    });
  } else {
    if (restfulServer) {
      let app = require("http").createServer();
      this._wss = new ws.Server({ server: app });
      app.on("request", restfulServer);
      app.listen(this.port, function () {
        console.log(`RESTFUL API listening on port ${this.port}.`);
      });
    } else {
      this._wss = new ws.Server({ port: this.port });
    }
  }

  const self = this;
  //ws server broadcast function
  this._wss.broadcast = function broadcast(data) {
    self._wss.clients.forEach(function each(client) {
      client.send(data);
    });
  };

  //check if str can be parsed by JSON
  const IsJsonString = function (str) {
    try {
      JSON.parse(str);
    } catch (e) {
      return false;
    }
    return true;
  };

  this._wss.on("connection", function (ws, req) {
    //连接时进行验证
    if (req && !ws.upgradeReq) {
      ws.upgradeReq = req;
    }
    console.log("A new connection is coming.");
    //if need authentication for this connection, set the isAuth to false
    //检测socket链接是否需要验证
    ws.isAuth = !self._needAuth;
    ws.noOfAttempt = -1;
    self.addClient(ws);
    //add ws to array
    ws.on("message", function (message, flags) {
      //需注意Socket的 4k上限
      if (message && message.includes("sendFileFTP")) {
        tempParam = message;
        return;
      }

      if (Object.keys(tempParam).length > 0 && typeof message == "object") {
        fileToTransferToFTP = message;
        message = tempParam;
        tempParam = {};
      }

      if (!message || (!IsJsonString(message) && typeof message != "object")) {
        return;
      }

      message = JSON.parse(message);

      if (fileToTransferToFTP && message["data"]) {
        message["data"].fileStream = fileToTransferToFTP;
      }

      self._dispatch(ws, message);
    });

    ws.on("close", function (code, message) {
      console.log("Close the connection", code, message);
      self.removeClient(ws);
    });

    //add error message for ws connection
    ws.on("error", function (error) {
      console.error("Connection error:", error);
      self.removeClient(ws);
    });

    //todo::test code
    //self._wss.broadcast(JSON.stringify({test:"broadcast"}));

    //update service wss
    for (service of self._services) {
      service.setWebSocketServer(self);
    }
  });
};

/**
 * 给控制器加入WebSocketService
 * @param {WebSocketService} service
 */
proto.addService = function (service, bClient) {
  const services = bClient ? this._clientServices : this._services;
  if (!service || services.indexOf(service) > -1) return;

  const oldService = this.getService(service.name, bClient);
  if (oldService) {
    //注销已注册的Service.
    const oldIdx = services.indexOf(oldService);
    services.splice(oldIdx, 1);
    oldService.unregister();
  }

  services.push(service);

  service.setWebSocketServer(this._wss);
};

/**
 * 通过Service name 得到Service.
 * @param {String} serviceName
 * @returns {WebSocketService}
 */
proto.getService = function (serviceName, bClient) {
  const services = bClient ? this._clientServices : this._services;
  for (let i = 0; i < services.length; i++) {
    if (services[i].name === serviceName) return services[i];
  }
};

proto.addClient = function (socket) {
  if (!socket) return;

  const clients = this._clients;
  if (clients.indexOf(socket) > -1) clients.push(ws);
};

proto.removeClient = function (socket) {
  if (socket) return;

  const clients = this._clients;
  const idx = clients.indexOf(socket);
  if (idx === -1) return;
  clients.splice(idx, 1);
};

//通知类API主要用于聊天. 以及一些站内消息
/**
 * 向所有已连接的客户端发送实时广播
 * @param {Object} data
 */
proto.broadcast = function (data) {};

proto.broadcastToCertified = function (data) {};

/**
 * Send a message to message server
 * @param {String} type
 * @param {String} service
 * @param {String} functionName
 * @param {JSON} data
 */
proto.sendMessage = function (type, service, functionName, data) {
  this._messageClient.sendMessage(type, service, functionName, data);
};

/**
 * 清除所有的服务.
 */
proto.clearService = function () {
  this._services.length = 0;
};

module.exports = WebSocketServer;
