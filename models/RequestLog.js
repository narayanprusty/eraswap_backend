var mongoose = require('mongoose');
var RequestSchema = new mongoose.Schema(
  {
    listingId:{
        type:String
    },
    listingType:{
        type:String,
        enum:['Buy','Sell']
    },
    userRequests:[
        {   
            userId:{
                type:mongoose.Schema.Types.ObjectId,
                ref:'Users'
            },
            amount:Number,
            message:String,
        }
    ],
  }
);

const RequestLog = mongoose.model('RequestLog', RequestSchema);
module.exports = RequestLog;
