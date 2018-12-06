const express = require('express');
const router = express.Router();
const currencyCont = require('../controllers/currency');
const walletCont = require('../controllers/wallets');
const request = require('request-promise');
const config = require('../configs/config');

router.get('/get_all_supported_currency', (req, res, next) => {
  currencyCont
    .get_supported_currency(req.query.keyWord)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next({
        message: 'Unknwn Error Occured.',
        error: error,
        status: 400,
      });
    });
});
router.get('/get_exchange_values', (req, res, next) => {
  currencyCont
    .getMax(req.query.from, req.query.to)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/checkVal', (req, res, next) => {
  if (!req.query.currency) {
    return next({
      message: 'No Currency Found',
      status: 400,
    });
  }
  return request('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?convert=USD&CMC_PRO_API_KEY='+config.coinMktCapKey+'&symbol=' + req.query.currency)
    .then(data => {
      console.log(data);
      if (req.query.platform === 'EST') {
        walletCont
          .getBalance(req.user.email, 'EST')
          .then(balanceData => {
            const fromCurVal = Number(req.query.amount)*JSON.parse(data).data[req.query.currency].quote.USD.price;
            const eqvEstVal = fromCurVal/config.EST_VAL;
            const deductableAmount = (eqvEstVal * (config.PLATFORM_FEE / 2)) / 100; //usually for EST it will be half.

            if (balanceData && Number(balanceData.balance) >= deductableAmount) {
              console.log('Its having enough amount to pay');
              return res.json(data);
            } else {
              return next({ status: 400, message: 'User Does not have enough amount to payoff fee. required fee is '+deductableAmount+'EST' });
            }
          })
          .catch(error => {
            return next(error);
          });
      } else {
        return res.json(data);
      }
    })
    .catch(error => {
      return next(error);
    });
});
router.get('/get_epositAddress', (req, res, next) => {
  if (!req.query.platform || !req.query.symbol) {
    return next({
      status: 400,
      message: 'Please pass all the params.',
    });
  }
  return currencyCont
    .getAddress(req.query.platform, req.query.symbol)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next({
        status: 400,
        message: error.message,
        stack: error.stack,
      });
    });
});
router.get('/getPrice', (req, res, next) => {
  const platform = req.query.platform;
  const symbol = req.query.symbol;
  if (!platform || !symbol) {
    return next({
      status: 400,
      message: 'Please pass all the params.',
    });
  }
  currencyCont
    .getCurrentMarket(platform, symbol)
    .then(data => {
      return res.json(data);
    })
    .catch(error => {
      return next({
        status: 400,
        message: error.message,
        stack: error.stack,
      });
    });
});
router.get('/current_BTC', (req, res, next) => {
  //https://blockchain.info/tobtc?currency=${req.query.currency}&value=1
  request
  
    .get('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?convert='+req.query.currency+'&CMC_PRO_API_KEY='+config.coinMktCapKey+'&symbol=' + req.query.cryptoCur)
    .then(data => {
      
      if (data) {
        const price = JSON.parse(data).data[req.query.cryptoCur].quote[req.query.currency].price;
        return res.send({ data: price });
      } else {
        return next('Error Occured');
      }
    })
    .catch(error => {
      return next(error);
    });
});
module.exports = router;
