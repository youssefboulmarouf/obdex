const path = require('path');
module.exports = {
  contracts_build_directory: path.join(__dirname, "client/src/contracts"),
  networks: {
    ganache: {
      network_id: "*",
      port: 7545,
      host: "127.0.0.1"
    }
  },
  mocha: {},
  compilers: {
    solc: {
      version: "^0.8.0"
    }
  }
};
