if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const path = require('path');
const ejsMate = require('ejs-mate');
const flash = require('connect-flash');
const expressError = require('./utils/expressError');
const mongoose = require('mongoose');
const Users = require('./models/user');
const kycs = require('./models/kyc'); // Import the KYC model/schema
const passport = require('passport');
const expressSession = require('express-session');
const localStrategy = require('passport-local');
const multer = require('multer'); // Import multer here
const axios = require('axios');
const cloudinary = require('cloudinary').v2; // Import cloudinary

cloudinary.config({
    cloud_name: 'dd6l7nvl2',
    api_key: '117239233527846',
    api_secret: 'NrqCSwiS_7RXepxynKk4dMHjSo8',
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads'); // Save files to the 'uploads' directory
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname); // Keep the original filename
    }
});

const upload = multer({ storage: storage });

const { isLoggedIn } = require('./middleware');

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/';

// Connect to MongoDB
mongoose.connect(dbUrl, { dbName: 'KYC-DB' })
    .then(() => console.log("Database Connected"))
    .catch(err => console.error("Database connection error:", err));

const app = express();

app.set('view engine', 'ejs');
app.engine('ejs', ejsMate);
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));
app.use(flash());

// Session Configuration
const secret = process.env.SECRET || 'thisshouldbeabettersecret!';
const sessionConfig = {
    name: 'KYCSession',
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true
    }
}
app.use(expressSession(sessionConfig));

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(Users.authenticate()));
passport.serializeUser(Users.serializeUser());
passport.deserializeUser(Users.deserializeUser());

// Middleware to make currentUser, success, and error available in all templates
app.use((req, res, next) => {
    res.locals.currentUser = req.user;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
})

app.get('/', async (req, res, next) => {
    try {
        // Fetch the current user's KYC status from the database
        const currentUser = req.user;
        if (currentUser) {
            const kycData = await kycs.findOne({ username: currentUser.fullname });
            res.render('home', { kycData });
        } else {
            // If the user is not logged in, render the home page without KYC data
            res.render('main');
        }
    } catch (error) {
        next(error);
    }
});

// Routes
app.get('/kyc', isLoggedIn, (req, res) => {
    res.render('kyc');
});

app.post('/kyc', upload.fields([
    { name: 'idFront', maxCount: 1 }, 
    { name: 'idBack', maxCount: 1 }, 
    { name: 'idSignature', maxCount: 1 } // Added idSignature field
]), async (req, res, next) => {
    try {
        // File Upload Handling and Cloudinary Integration
        const idFront = req.files.idFront[0];
        const idBack = req.files.idBack[0];
        const idSignature = req.files.idSignature[0]; // Fixed accessing idSignature as a file
        const selfieImg = req.body.selfie;

        const cloudinaryResponseSignature = await cloudinary.uploader.upload(idSignature.path);
        const cloudinaryResponseFront = await cloudinary.uploader.upload(idFront.path);
        const cloudinaryResponseBack = await cloudinary.uploader.upload(idBack.path);
        const cloudinaryResponse = await cloudinary.uploader.upload(selfieImg, { folder: 'selfies' });

        const { idAdhar, idPAN, fullname, idEmployment, idIncome } = req.body;
        const kyc = new kycs({ idAdhar, idPAN, kycStatus: true, username: fullname, idEmployment, idIncome });
        await kyc.save();
        res.redirect('/');
    } catch (error) {
        next(error);
    }
});


app.get('/register', (req, res) => {
    res.render('register');
});

app.post('/register', async (req, res) => {
    try {
        const { username, fullname, dob, gender, address, password } = req.body;
        const user = new Users({ username, fullname, dob, gender, address });
        const registeredUser = await Users.register(user, password);
    
        req.logIn(registeredUser, (e) => {
            if (e) return next(e);
            req.flash('success', 'Successfully registered!');
            res.redirect('/');
        });
    } catch (e) {
        req.flash('error', e.message);
        console.log(e);
        res.redirect('/register');
    }
});

app.get('/logout', (req, res) => {
    req.logout(req.user, e => {
        if (e) return next(e);

        req.flash('success', 'Successfully logged out!');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', passport.authenticate('local', { failureFlash: true, failureRedirect: '/login', keepSessionInfo: true }), (req, res) => {
    try {
        if (req.isAuthenticated(req, res)) {
            console.log('Authenticated');
            req.flash('success', 'Successfully logged in!');
            
            res.redirect('/');
        }
    } catch (e) {
        console.log(e);
        req.flash('error', e.message);
        res.redirect('/login');
    }
});

app.get('*', (req, res, next) => {
    next(new expressError('Page Not Found!', 404));
});

app.use((err, req, res, next) => {
    const { statusCode = 500 } = err;
    if (!err.message) err.message = 'Something went wrong.';
    res.status(statusCode).render('error', { err });
});

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
