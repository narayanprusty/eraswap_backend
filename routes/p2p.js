const express = require('express');
const router = express.Router();
const currencyCont = require('../controllers/p2p.cont');
const Coins = require('../models/Coins');
const walletCont = require('../controllers/wallets');
const config = require('../configs/config');
const request = require('request-promise');

router.get('/feeParams', async (req, res, next) => {
  const EST_VAL = await Coins.findOne({ name: 'coinData', in: 'USD' })
    .select('EST BTC ETH')
    .exec();
  return res.json(EST_VAL);
});

router.post('/add_buy_listing', (req, res, next) => {
  currencyCont
    .addListing({ show: true, wantsToBuy: true, email: req.user.email, username: req.user.username, userId: req.user._id, ...req.body })
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
router.post('/add_sell_listing', (req, res, next) => {
  return Coins.findOne({ name: 'coinData', in: 'USD' })
    .select({ [req.body.cryptoCur]: 1, EST: 1 })
    .lean()
    .exec()
    .then(async data => {
      if (!data[req.body.cryptoCur]) {
        try {
          var capdata = await request(
            'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?convert=USD&CMC_PRO_API_KEY=' + config.coinMktCapKey + '&symbol=' + req.query.currency
          );
          var price = JSON.parse(capdata).data[req.body.cryptoCur].quote['USD']['price'];
          // await Coins.update({ name: 'coinData', in: 'USD' }, { $set: {  [req.query.currency]: price,in:'USD' } }, { upsert: true }).exec();
          data = { ...data, [req.body.cryptoCur]: price };
        } catch (error) {
          return next({ status: 400, message: 'unable to calculate fees!' });
        }
      }

      if (req.body.feeCoin === 'EST') {
        walletCont
          .getBalance(req.user.email, 'EST')
          .then(balanceData => {
            const fromCurVal = Number(req.body.maximum) * data[req.body.cryptoCur];
            const eqvEstVal = fromCurVal / data['EST'];
            let deductableAmount = (eqvEstVal * (config.P2P_FEE / 2)) / 100; //usually for EST it will be half.
            if (req.body.cryptoCur == 'EST') {
              deductableAmount = deductableAmount + Number(req.body.maximum);
            }
            if (balanceData && Number(balanceData.balance) >= deductableAmount) {
              if (req.body.cryptoCur != 'EST' && req.body.wantsToSell) {
                walletCont.getBalance(req.user.email, req.body.cryptoCur).then(balanceData => {
                  if (balanceData && Number(balanceData.balance) >= !req.body.amount) {
                    return next({ status: 400, message: 'you dont have enough ' + req.body.cryptoCur + ' to place order.' });
                  }
                });
              }
              currencyCont
                .addListing({ show: true, wantsToSell: true, email: req.user.email, username: req.user.username, userId: req.user._id, ...req.body })
                .then(data => {
                  return res.json(data);
                })
                .catch(error => {
                  return next(error);
                });
            } else {
              return next({ status: 400, message: 'User Does not have enough balance to place order.' });
            }
          })
          .catch(error => {
            return next(error);
          });
      } else {
        walletCont
          .getBalance(req.user.email, req.body.feeCoin)
          .then(balanceData => {
            const deductableAmount = (Number(req.body.maximum) * config.P2P_FEE) / 100 + Number(req.body.maximum);

            if (balanceData && Number(balanceData.balance) >= deductableAmount) {
              currencyCont
                .addListing({ show: true, wantsToSell: true, email: req.user.email, username: req.user.username, userId: req.user._id, ...req.body })
                .then(data => {
                  return res.json(data);
                })
                .catch(error => {
                  return next(error);
                });
            } else {
              return next({ status: 400, message: 'User Does not have enough balance to place the order' });
            }
          })
          .catch(error => {
            return next(error);
          });
      }
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/search_listing', (req, res, next) => {
  console.log(req.query);
  currencyCont
    .searchListing(req.query, req.user._id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.get('/my_listings', (req, res, next) => {
  currencyCont
    .getAllListings({ ...req.query, query: { userId: req.user._id } })
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/my_listings_count', (req, res, next) => {
  currencyCont
    .getListingCount({ userId: req.user._id })
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.get('/get_count', (req, res, next) => {
  currencyCont
    .getCount(req.query, req.user._id)
    .then(data => {
      return res.json({ count: data });
    })
    .catch(error => {
      return next(error);
    });
});
router.post('/change_status', (req, res, next) => {
  currencyCont
    .updateListing(req.user._id, req.body.id, req.body.active)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
/**
 *  body:
 *  amountAsked
 * specialMessage
 * wantsToBuy
 * username // of opposite person
 */
router.post('/showInterest', (req, res, next) => {
  let message = {
    subject: `[Eraswap Marketplace] ${req.user.username} just showed interest on your listing.`,
    body: `<body>
                Hi, ${req.body.username},
                <br />
                ${req.user.username} Just showed You interest on your listing.
                <br />
                he/she Interested to ${req.body.wantsToBuy ? 'sell to you' : 'buy your'} the listed asset,
                <br />
                Special Message from user: <i><b>${req.body.specialMessage || '-'}</b></i>
                <br />
                Please contact to email: ${req.user.email} .
                <br />
                Thank you!
              </body>`,
  };
  let fee;
  currencyCont
    .calculateFee(req.body.feeCoin, req.body.askAmount, req.body.cryptoCur)
    .then(fee => {
      const savableData = {
        userId: req.user._id,
        amount: req.body.askAmount,
        message: req.body.specialMessage,
        sellerEmail: req.body.wantsToBuy ? req.user.email : req.body.email,
        fee: fee,
        sellerFeeCoin: req.body.feeCoin,
      };

      currencyCont
        .recordRequest(req.body.uniqueIdentifier, req.body.wantsToBuy ? 'Buy' : 'Sell', savableData)
        .then(loggedData => {
          return currencyCont
            .showInterestMailSender(req.body, message, req.user.email)
            .then(data => {
              return res.json(data);
            })
            .catch(error => {
              return next(error);
            });
        })
        .catch(errorLogging => {
          return next(errorLogging);
        });
    })
    .catch(error => {
      console.log(error);
      return next({ status: 400, message: 'unable to calculate fee.' });
    });
});

router.get('/getInterests', (req, res, next) => {
  currencyCont
    .getUserListInterests(req.query.listingId)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.post('/makeMatch', (req, res, next) => {
  /**
   * req.body:
   * listingId,
   * sellerEmail
   * requester
   * amount
   * cryptoCurrency
   */
  currencyCont
    .matchingHandler(req.body.listingId, req.body.sellerEmail, req.user._id, req.body.requester, req.body.amount, req.body.cryptoCurrency, req.body.feeCoin)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.get('/myListMatches', (req, res, next) => {
  currencyCont
    .getMyListMatches(req.user._id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/requesterListMatches', (req, res, next) => {
  currencyCont
    .requesterListMatches(req.user._id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/getMyOwnInterests', (req, res, next) => {
  currencyCont
    .getMyOwnInterests(req.user._id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.get('/getMyrequests', (req, res, next) => {
  currencyCont
    .getSentInterests(req.user._id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.post('/change_status_paid', (req, res, next) => {
  currencyCont
    .change_status_paid(req.body.id)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

router.post('/finishDeal', (req, res, next) => {
  currencyCont
    .finishDeal(req.body.id, req.body.record, req.body.item)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});

module.exports = router;
