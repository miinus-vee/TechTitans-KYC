const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const passportLocalMongoose = require('passport-local-mongoose');
var validator = require('aadhaar-validator')

function validatePanCard(panNumber) {
    const panRegex = /[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const cleanedPan = panNumber.replace(/\s/g, '').toUpperCase();
    return panRegex.test(cleanedPan);
}

const kycSchema = new Schema({
    username:{
        type: String,
        required: false,

    },
    idEmployment:{
        type: String,
        required: true
    },
    idIncome:{
        type: String,
        required: true
    },
idAdhar: {
    type: String,
    required: [true,'This is a required field'],
    default: "",
},
idPAN:{
    type: String,
    required:[true,'Please Enter your Id'],
    validator: [validatePanCard, 'Please enter a valid PAN']
},
kycStatus: {
    type: Boolean,
    required: false,
    default: true
}
});

kycSchema.post('save', function (error, doc, next) {
    if (error.name === 'MongoError' && error.code === 11000) {
        next(new Error('Contact Number already registered!'));
    } else {
        next(error);
    }
});

kycSchema.plugin(passportLocalMongoose);

module.exports = mongoose.model('kycs', kycSchema);