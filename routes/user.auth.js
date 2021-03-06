const express = require('express');
const router = express.Router();

const UserAuthCont = require('../controllers/user.auth.cont');
const WalletCont = require('../controllers/wallets');

router.post('/signup', async (req, res, next) => {
    if (!req.body.email || !req.body.username || !req.body.password || !req.body.host) {
        return next({
            message: 'All fields are required.',
            status: 400
        });
    }
    var gasTankCheck = await WalletCont.checkGasTank();
    if (gasTankCheck.result) {
        UserAuthCont.register(req.body, req.body.host).then(data => {
            delete data.password;
            return res.json(data);
        }).catch(error => {
            if(error){
                if(error.message){
                    if(error.message == "Validation failed"){
                        error.message = "Email address or Username already exists!"
                    }
                }
            }
            return next({
                message: error ? (error.message ? error.message : error) : "Unexpected Error occured!",
                status: 400
            });
        });
    }
    else {
        return next({
            message: gasTankCheck.message,
            status: 400
        });
    }
});

router.post('/login', (req, res, next) => {
    if (!req.body.email || !req.body.password) {
        return next({
            message: 'All fields are required.',
            status: 400
        });
    }
    UserAuthCont.login(req.body).then(data => {
        return res.json(data);
    }).catch(error => {
        return next(error);
    })
});

router.post('/resendVerification', (req, res, next) => {
    if (!req.body.email || !req.body.host) {
        return next({
            message: 'All fields are required.',
            status: 400
        });
    }
    console.log(req.body);
    UserAuthCont.resendVerification(req.body.email, req.body.host).then(data => {
        return res.json(data);
    }).catch(error => {
        return next(error);
    })
});

router.post('/login/fb', (req, res, next) => {
    const state = req.body.state;
    const code = req.body.code;
    UserAuthCont.facebookLogin(code).then(data => {
        return res.json(data);
    }).catch(error => {
        return next(error);
    });
});

router.post('/login/google', (req, res, next) => {
    const state = req.body.state;

    const code = req.body.code;
    UserAuthCont.googleLogin(code).then(data => {
        return res.json(data);
    }).catch(error => {
        return next(error);
    });
});

router.post('/forgotPassword', (req, res, next) => {
    console.log(req.query);
    if (req.body.email) {
        UserAuthCont.forgotPassword(req.body.email, req.body.host)
            .then(data => {
                if (data.success) {
                    return res.json(data);
                } else {
                    return next({ status: "400", ...data })
                }
            })
            .catch(error => {
                console.log(error);
                return next({ status: "400", message: "Unable to activate." })
            });
    }
    else {
        return next({
            error: 400,
            message: "No email address found"
        })
    }
});

router.post('/resetPassword', (req, res, next) => {
    const password = req.body.password;
    const code = req.body.code;
    UserAuthCont.resetPassword(code, password).then(data => {
        if (data.success) {
            return res.json(data);
        } else {
            return next({ status: "400", ...data })
        }
    }).catch(error => {
        return next(error);
    });
});

router.get('/activateAccount', (req, res, next) => {
    if (!req.query.id || req.query.id == 'undefined') {
        return next({
            error: 400,
            message: "No activation id found"
        })
    }
    UserAuthCont.activateAccount(req.query.id).then(data => {
        return res.json(data);
    }).catch(error => {
        console.log(error);
        return next({ status: "400", message: "Unable to activate." })
    });
});

module.exports = router;
