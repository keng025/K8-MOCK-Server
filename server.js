const createWSServer = require("./createWSServer");

//express REST API config
const PORT = "9063";

//WS API
const CNSERVER = createWSServer.buildWSServer([], false);
const clientServer = new CNSERVER(PORT);
clientServer._needAuth = true;
clientServer.run();
 