var Blockcluster = require('blockcluster');
const shortid = require('shortid');
const request = require('request-promise');
const Coins = require('../models/Coins');
const mailHelper = require('../helpers/mailHelper');
const RequestLog = require('../models/RequestLog');
const Withdrawals = require('../models/Withdrawal');
const Users = require('../models/Users');
const config = require('../configs/config');
const escrowCont = require('./escrow.cont');
const walletCont = require('./wallets');
const BigNumber = require('bignumber.js');

const node = new Blockcluster.Dynamo({
  locationDomain: config.BLOCKCLUSTER.host,
  instanceId: config.BLOCKCLUSTER.instanceId,
});

const addListing = async data => {
  var identifier = shortid.generate();
  await node.callAPI('assets/issueSoloAsset', {
    assetName: config.BLOCKCLUSTER.assetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    toAccount: node.getWeb3().eth.accounts[0],
    identifier: identifier,
  });

  //update agreement meta data

  await node.callAPI('assets/updateAssetInfo', {
    assetName: config.BLOCKCLUSTER.assetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    identifier: identifier,
    public: { ...data, createdAt: Date.now() },
  });
};

const searchListing = async (params, userId) => {
  let additionalQuery = JSON.parse(params.query).wantsToBuy ? { wantsToBuy: true } : { wantsToSell: true };
  let data;
  try {
    data = await node.callAPI('assets/search', {
      $query: {
        assetName: config.BLOCKCLUSTER.assetName,
        status: 'open',
        show: true,
        userId: { $ne: userId },
        ...additionalQuery,
      },
      $limit: Number(params.results) || 10,
      $skip: params.results && params.page ? (Number(params.page) - 1) * Number(params.results) : 0,
      $sort: {
        _id: -1,
      },
    });
  } catch (error) {
    console.log(error);
  }
  return data;
};

const getAllListings = async params => {
  const additionalQuery = params.query;
  let data;
  try {
    data = await node.callAPI('assets/search', {
      $query: {
        assetName: config.BLOCKCLUSTER.assetName,
        status: 'open',
        ...additionalQuery,
      },
      $limit: Number(params.results) || 10,
      $skip: params.results && params.page ? (Number(params.page) - 1) * Number(params.results) : 0,
      $sort: {
        _id: -1,
      },
    });
  } catch (error) {
    console.log(error);
  }
  return data;
};
const getCount = async (type, userId) => {
  let additionalQuery = type.wantsToBuy != 'false' ? { wantsToBuy: true } : { wantsToSell: true };
  const countObj = await node.callAPI('assets/count', {
    $query: {
      assetName: config.BLOCKCLUSTER.assetName,
      status: 'open',
      show: true,
      userId: { $ne: userId },
      ...additionalQuery,
    },
  });
  return countObj.message;
};

const getListingCount = async type => {
  const countObj = await node.callAPI('assets/count', {
    $query: {
      assetName: config.BLOCKCLUSTER.assetName,
      status: 'open',
      ...type,
    },
  });
  return countObj.message;
};

const updateListing = async (userId, id, active) => {
  //active is the current
  const status = active ? false : true;
  const data = await node.callAPI('assets/updateAssetInfo', {
    assetName: config.BLOCKCLUSTER.assetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    identifier: id,
    userId: userId,
    public: {
      show: status,
    },
  });

  return data;
};

const showInterestMailSender = async (record, message, userEmail) => {
  const userData = await Users.findOne({ _id: record.userId })
    .select({ email: 1 })
    .exec();
  message['to'] = userData.email;
  return await mailHelper.SendMail(message, userEmail);
};

//call this when someone requests
const recordRequest = async (listingId, listingType, data) => {
  const listingDocExist = await RequestLog.findOne({ listingId: listingId }).exec();
  if (!listingDocExist) {
    const savableObj = new RequestLog({
      listingId: listingId,
      listingType: listingType,
      userRequests: data,
    });
    savableObj.save((error, saved) => {
      if (error) {
        throw error;
      }
      return saved;
    });
  } else {
    return RequestLog.updateOne(
      { listingId: listingId },
      {
        $push: { userRequests: data },
      }
    ).exec();
  }
};
const calculateFee = async (feeCoin, amount, baseCrypto) => {
  let data = await Coins.findOne({ name: 'coinData', in: 'USD' })
    .select({ cryptoCurrency: 1, EST: 1 })
    .lean()
    .exec();
  if (!data[baseCrypto]) {
    var capdata = await request('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?convert=USD&CMC_PRO_API_KEY=' + config.coinMktCapKey + '&symbol=' + baseCrypto);
    var price = JSON.parse(capdata).data[baseCrypto].quote['USD']['price'];
    // await Coins.update({ name: 'coinData', in: 'USD' }, { $set: {  [req.query.currency]: price,in:'USD' } }, { upsert: true }).exec();
    data = { ...data, [baseCrypto]: price };
  }
  let fee;
  if (feeCoin == 'EST') {
    const fromCurVal = amount * data[baseCrypto];
    const eqvEstVal = fromCurVal / data['EST'];

    fee = new BigNumber(eqvEstVal)
      .multipliedBy(config.P2P_FEE / 2)
      .dividedBy(100)
      .toNumber();
  } else {
    fee = new BigNumber(amount)
      .multipliedBy(config.P2P_FEE)
      .dividedBy(100)
      .toNumber();
  }
  return fee;
};
//call this on match from the request received list
const matchingHandler = async (listingId, sellerEmail, ownerUserId, requester, amount, cryptoCurrency, feeCoin) => {
  //send the amount to escrow wallet from seller wallet
  const escrowAddress = await escrowCont.getDepositAddress(cryptoCurrency);
  const feeAddress = await escrowCont.getDepositAddress(feeCoin);
  let modifiedFeeAddress;
  let modifiedEscAddress;
  if (feeCoin != 'BTC') {
    modifiedFeeAddress = feeAddress.toLocaleLowerCase();
  }
  if (cryptoCurrency != 'BTC') {
    modifiedEscAddress = escrowAddress.toLocaleLowerCase();
  }
  let fee;
  let data = await Coins.findOne({ name: 'coinData', in: 'USD' })
    .select({ cryptoCurrency: 1, EST: 1 })
    .lean()
    .exec();
  if (!data[cryptoCurrency]) {
    var capdata = await request(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?convert=USD&CMC_PRO_API_KEY=' + config.coinMktCapKey + '&symbol=' + cryptoCurrency
    );
    var price = JSON.parse(capdata).data[cryptoCurrency].quote['USD']['price'];
    // await Coins.update({ name: 'coinData', in: 'USD' }, { $set: {  [req.query.currency]: price,in:'USD' } }, { upsert: true }).exec();
    data = { ...data, [cryptoCurrency]: price };
  }
  let sendStatusO;
  let amountReceived;
  if (feeCoin == 'EST') {
    const fromCurVal = amount * data[cryptoCurrency];
    const eqvEstVal = fromCurVal / data['EST'];

    fee = new BigNumber(eqvEstVal)
      .multipliedBy(config.P2P_FEE / 2)
      .dividedBy(100)
      .toNumber();
    //deduct 0.125% from user wallet and send to escrow
    let feeVar = fee;
    if (cryptoCurrency == 'EST') {
      //   fee = fee + amount;
      feeVar = fee + amount;
    }
    const sendStatus = await walletCont.send(sellerEmail, feeVar, modifiedFeeAddress, 'EST'); //let it transfer or incase error it will exit from here.
    if (!sendStatus.success) {
      throw sendStatus;
    }
    amountReceived = sendStatus.dbObject.txn.amountReceived;
    if (cryptoCurrency == 'EST') {
      sendStatusO = sendStatus;
      amountReceived = amountReceived - fee;
    }
  } else {
    // 0.25% deduct and place order
    fee = new BigNumber(amount)
      .multipliedBy(config.P2P_FEE)
      .dividedBy(100)
      .toNumber();

    const sendStatus = await walletCont.send(sellerEmail, fee, modifiedFeeAddress, feeCoin);
    if (!sendStatus.success) {
      throw sendStatus;
    }
  }

  if (cryptoCurrency != 'EST') {
    sendStatusO = await walletCont.send(sellerEmail, amount, modifiedEscAddress, cryptoCurrency); //let it transfer or incase error it will exit from here.
    if (!sendStatusO.success) {
      throw sendStatusO;
    }
    amountReceived = sendStatusO.dbObject.txn.amountReceived;
  }

  //do this after sending to escrow;
  const dataSTB = {
    cryptoCurrency: cryptoCurrency,
    listingId: listingId,
    ownerUserId: ownerUserId,
    requester: requester,
    amount: amount,
    showIpaid: true,
    iPaidVal: false,
    finished: false,
    fee: fee,
    feeCoin: feeCoin,
    amountReceived: amountReceived,
    createdAt: Date.now(),
  };
  var identifier = shortid.generate();
  await node.callAPI('assets/issueSoloAsset', {
    assetName: config.BLOCKCLUSTER.matchAssetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    toAccount: node.getWeb3().eth.accounts[0],
    identifier: identifier,
  });

  let withdrawal = sendStatusO.dbObject;
  var dbObject = await Withdrawals.findById(withdrawal._id);
  dbObject['p2pInfo'] = {
    orderId: identifier,
  };
  await dbObject.save();

  //update agreement meta data
  return await node.callAPI('assets/updateAssetInfo', {
    assetName: config.BLOCKCLUSTER.matchAssetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    identifier: identifier,
    public: dataSTB,
  });
};

const getSentInterests = async userId => {
  const requestLogs = await RequestLog.find({ 'userRequests.userId': userId })
    .select({
      listingId: 1,
      'userRequests.$.userId': 1,
    })
    .exec();
  let allListings = [];
  for (let i of requestLogs) {
    allListings.push(i.listingId);
  }
  console.log(allListings);
  let data;
  try {
    data = await node.callAPI('assets/search', {
      $query: {
        assetName: config.BLOCKCLUSTER.assetName,
        uniqueIdentifier: { $in: allListings },
      },
      $sort: {
        _id: -1,
      },
    });
  } catch (error) {
    console.log(error);
  }
  return data;
};

const getMyListMatches = async userId => {
  return await node.callAPI('assets/search', {
    $query: {
      assetName: config.BLOCKCLUSTER.matchAssetName,
      ownerUserId: userId,
    },
    $sort: {
      _id: -1,
    },
  });
};

const requesterListMatches = async userId => {
  return await node.callAPI('assets/search', {
    $query: {
      assetName: config.BLOCKCLUSTER.matchAssetName,
      requester: userId,
    },
    $sort: {
      _id: -1,
    },
  });
};
const getMyOwnInterests = async userId => {
  return RequestLog.find({ 'userRequests.userId': userId })
    .select({
      listingId: 1,
    })
    .exec();
};
const getUserListInterests = async listingId => {
  return await RequestLog.findOne({ listingId: listingId })
    .populate({
      path: 'userRequests.userId',
      select: 'username',
    })
    .exec();
};
const change_status_paid = async id => {
  const data = await node.callAPI('assets/updateAssetInfo', {
    assetName: config.BLOCKCLUSTER.matchAssetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    identifier: id,
    public: {
      showIpaid: false,
      iPaidVal: true,
    },
  });

  return data;
};

const onTxnConfirm = async id => {
  const data = await node.callAPI('assets/updateAssetInfo', {
    assetName: config.BLOCKCLUSTER.matchAssetName,
    fromAccount: node.getWeb3().eth.accounts[0],
    identifier: id,
    public: {
      txnConfirmed: true,
    },
  });

  return data;
};

const finishDeal = async (id, record, item) => {
  if (record.wantsToSell) {
    //its a sell listing,
    //requester should be buyer >
    const buyeremail = await Users.findOne({ _id: item.userId })
      .select('email')
      .exec();
    const buyeraddress = await walletCont.getAddress(buyeremail.email, record.cryptoCur);
    const sendStatusEs = await escrowCont.send(record.cryptoCur, buyeraddress, item.amountReceived); //send amount received
    if (!sendStatusEs.success) {
      throw sendStatusEs;
    }
    const data = await node.callAPI('assets/updateAssetInfo', {
      assetName: config.BLOCKCLUSTER.matchAssetName,
      fromAccount: node.getWeb3().eth.accounts[0],
      identifier: id,
      public: {
        finished: true,
      },
    });
    return data;
  } else {
    //its a buy listing
    //requester should be seller
    const buyeraddress = await walletCont.getAddress(record.email, record.cryptoCur);
    const sendStatusEsO = await escrowCont.send(record.cryptoCur, buyeraddress, item.amount);
    if (!sendStatusEsO.success) {
      throw sendStatusEsO;
    }
    const data = await node.callAPI('assets/updateAssetInfo', {
      assetName: config.BLOCKCLUSTER.matchAssetName,
      fromAccount: node.getWeb3().eth.accounts[0],
      identifier: id,
      public: {
        finished: true,
      },
    });
    return data;
  }
};

module.exports = {
  calculateFee,
  addListing,
  searchListing,
  getCount,
  showInterestMailSender,
  getListingCount,
  getAllListings,
  updateListing,
  recordRequest,
  matchingHandler,
  getUserListInterests,
  getMyOwnInterests,
  getMyListMatches,
  getSentInterests,
  requesterListMatches,
  change_status_paid,
  finishDeal,
  onTxnConfirm,
};
