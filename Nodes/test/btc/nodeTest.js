// const Client = require('bitcoin-core');
const request = require('request');
const BtcRpc = require('../../BTCRpc');
const mongoose = require('mongoose');
const config = require('../../../configs/config');

mongoose.connect(
    config.mongo.url, {
        useNewUrlParser: true
    }
);

let BtcNodeHost = "13.233.168.86";
let BtcNodePort = 8555;

let username = "foo";
let password = "bar";

let btcRpc = new BtcRpc(BtcNodeHost, BtcNodePort, username, password);
// User and password specified like so: node index.js username password.
var addr = "2Msr9kCgRgc3xrQbKytVGjKZioAkLLXDxqQ";
run = async () => {
    try {
        ///await btcRpc.createWallet("qwqw");
        //var op = await btcRpc.send("qwqw", "1Ef7ngbaXmqURjVUX19WjbCTJqiBbrDyAJ", 0.1);
        op = await btcRpc.getBalance("ukrocks.mehta@gmail.com");
        console.log(op.result);
        op = await btcRpc.send("ukrocks.mehta@gmail.com", "mo4MxcuVogjdpDmqyiGfMgDmLK7UQ8tqpw", 0.0001);
        console.log(op.dbObject.txnHash);
    } catch (ex) {
        console.log(ex);
    }
}
run();
//btcRpc.recoverWallet("ew@ew.com").then(console.log).catch(console.log);
//btcRpc.getAddress("uk1_1peesp@uk.com").then(res => console.log(res)).catch(console.log);
// btcRpc.SendBtcToEmail("dhiren", "uk13@uk.com", 0.001).then(res => console.log(res.result));
//btcRpc.getBalance("uk11peesp@uk.com").then(console.log);

//btcRpc.getPrivateKey("uk1__1peesp@uk.com", '2N9BkwQgPsWzLmgVgmpZGfV4whCBTvJ7QY6').then(console.log).catch(console.log);
