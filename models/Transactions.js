const mongoose = require('mongoose');

const TxnSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Users',
      required: true,
    },
    dipositTxnId: {
      type: String,
    },
    dipositTxnStatus: {
      type: String,
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    feePaid: {
      type: Boolean,
    },
    platform_fee: {
      type: Number,
    },
    cancelledConvertion: {
      type: Boolean,
      default: false,
    },
    depositNotFpund: {
      type: Boolean,
      default: true,
    },
    orderplacingAmt: {
      type: String,
    },
    side: {
      type: String,
    },
    conversation_fees: {
      type: Number,
    },
    convertedYet: {
      type: String,
      default: null,
      enum: [null, 'started', 'finished'],
    },
    amtToSend: {
      type: Number,
    },
    orderId: {
      type: String,
    },
    convertionTime: {
      type: Number,
    },
    witdrawn: {
      type: Boolean,
      default: false,
    },
    exchFromCurrency: {
      type: String,
      required: true,
    },
    exchFromCurrencyAmt: {
      type: Number,
      required: true,
    },
    exchToCurrency: {
      type: String,
      required: true,
    },
    exchToCurrencyRate: {
      type: Number,
      required: true,
    },
    allExchResult: {
      type: Array,
    },
    eraswapAcceptAddress: {
      type: String,
      require: true,
    },
    eraswapSendAddress: {
      type: String,
      require: true,
    },
    exchangePlatform: {
      type: String,
    },
    eraswapAcceptTag: {
      type: String,
    },
    eraswapSendTag: {
      type: String,
    },
    totalExchangeAmout: {
      type: String,
      required: true,
    },
    platformFeePayOpt: {
      type: String,
      default: 'EST',
      enum: ['EST', 'source'],
    },
    ersToCastTxid: {
      type: String,
    },
    cancelled: {
      type: Boolean,
      default: false,
    },
    fromWallet: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Txn = mongoose.model('Txn', TxnSchema);
module.exports = Txn;
