var Blockcluster = require('blockcluster');
const shortid = require("shortid");

const mailHelper = require('../helpers/mailHelper');
const RequestLog = require('../models/RequestLog');
const Users = require('../models/Users');
const config = require('../configs/config');
const escrowCont = require('./escrow.cont');
const walletCont = require('./wallets');

const node = new Blockcluster.Dynamo({
    locationDomain: config.BLOCKCLUSTER.host,
    instanceId: config.BLOCKCLUSTER.instanceId
  });

const addListing =async(data)=>{
    var identifier = shortid.generate();
    await node.callAPI('assets/issueSoloAsset', {
        assetName: config.BLOCKCLUSTER.assetName,
        fromAccount: node.getWeb3().eth.accounts[0],
        toAccount: node.getWeb3().eth.accounts[0],
        identifier: identifier
      });

      //update agreement meta data
      await node.callAPI('assets/updateAssetInfo', {
        assetName: config.BLOCKCLUSTER.assetName,
        fromAccount: node.getWeb3().eth.accounts[0],
        identifier: identifier,
        "public": data
      });
};

const searchListing = async(params)=>{
   let additionalQuery = JSON.parse(params.query).wantsToBuy ? {wantsToBuy:true}:{wantsToSell:true};
   let data;
   try{
        data=  await node.callAPI("assets/search", {
        $query: {
            "assetName": config.BLOCKCLUSTER.assetName,
            "status": "open",
            "show":true,
            ...additionalQuery
          },
          $limit:Number(params.results) || 10,
          $skip: params.results && params.page ?  (Number(params.page)-1)*Number(params.results) :0,
          $sort: {
            timestamp: 1
          }
      });
    }catch(error){
        console.log(error)
    }
      return data;
}

const getAllListings = async(params)=>{
    const additionalQuery = params.query;
    let data;
    try{
         data=  await node.callAPI("assets/search", {
         $query: {
             "assetName": config.BLOCKCLUSTER.assetName,
             "status": "open",
             ...additionalQuery
           },
           $limit:Number(params.results) || 10,
           $skip: params.results && params.page ?  (Number(params.page)-1)*Number(params.results) :0,
           $sort: {
             timestamp: 1
           }
       });
     }catch(error){
         console.log(error)
     }
       return data;
}
const getCount = async(type)=>{
    let additionalQuery = type.wantsToBuy!="false" ? {wantsToBuy:true}:{wantsToSell:true}
        const countObj =await node.callAPI('assets/count',{
       
           $query:{ "assetName": config.BLOCKCLUSTER.assetName,
            "status": "open",
            show:true,
            ...additionalQuery
        }
    });
    return countObj.message;
}

const getListingCount = async(type)=>{
    
        const countObj =await node.callAPI('assets/count',{
       
           $query:{ "assetName": config.BLOCKCLUSTER.assetName,
            "status": "open",
            ...type
        }
    });
    return countObj.message;
}

const updateListing =async(userId,id,active)=>{
    //active is the current 
    const status = active ? false : true;
    const data =await node.callAPI('assets/updateAssetInfo', {
        assetName: config.BLOCKCLUSTER.assetName,
        fromAccount: node.getWeb3().eth.accounts[0],
        identifier: id,
        userId:userId,
        "public": {
            show:status
        }
      });
    
      return data;
}

const showInterestMailSender =async(record,message)=>{
   const userData = await Users.findOne({_id:record.userId}).select({"email":1}).exec();
   message["to"] =userData.email
    return await mailHelper.SendMail(message);
}

//call this when someone requests
const recordRequest = async (listingId,listingType,data) => {
  
    const listingDocExist = await RequestLog.findOne({listingId:listingId}).exec();
    if(listingDocExist){
        const savableObj = new RequestLog({
            listingId:listingId,
            listingType:listingType,
            userRequests:data
        });
        savableObj.save((error, saved) => {
            if (error) {
              throw error;
            }
            return saved;
          });
    }else{
        return RequestLog.updateOne({listingId:listingId},{$push:{
          $push:{ userRequests:data}
        }}).exec();
    }
  };

  //call this on match from the request received list
  const matchingHandler = async(listingId,sellerEmail,userId,amount,currency)=>{
      //send the amount to escrow wallet from seller wallet
      const escrowAddress = await escrowCont.getDepositAddress(currency);
     const sendToEscrow = await walletCont.send(sellerEmail,amount,escrowAddress,currency);
     //do this after sending to escrow;
      const data={
        listingId:listingId,
        userId:userId,
        amount:amount,
        showIpaid:true,
        finished:false
      };
    var identifier = shortid.generate();
    await node.callAPI('assets/issueSoloAsset', {
        assetName: 'MatchData',
        fromAccount: node.getWeb3().eth.accounts[0],
        toAccount: node.getWeb3().eth.accounts[0],
        identifier: identifier
      });

      //update agreement meta data
      await node.callAPI('assets/updateAssetInfo', {
        assetName: 'MatchData',
        fromAccount: node.getWeb3().eth.accounts[0],
        identifier: identifier,
        "public": data
      });
      return true;
  }
module.exports={
    addListing,
    searchListing,
    getCount,
    showInterestMailSender,
    getListingCount,
    getAllListings,
    updateListing,
    recordRequest,
    matchingHandler
}