const express = require('express');
const router = express.Router();
const currencyCont = require('../controllers/p2p.cont');

router.post('/add_buy_listing',(req,res,next)=>{
    currencyCont.addListing({wantsToBuy:true,...req.body}).then(data=>{
        return res.json(data);
    }).catch(error=>{
        return next(error);
    })
});
router.post('/add_sell_listing',(req,res,next)=>{
    currencyCont.addListing({wantsToSell:true,...req.body}).then(data=>{
        return res.json(data);
    }).catch(error=>{
        return next(error);
    })
});

module.exports = router;