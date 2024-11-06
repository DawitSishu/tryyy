'use strict';

var mongoose = require('mongoose');
var config = require('../../config/config');

var Schema = mongoose.Schema;

var UnlockSchema = new Schema({
    dateAdded: { 
        type: Date, 
        default: Date.now, 
        expires: config.accounts.passwordRecoveryExpiration * 60 * 60 
    },
    lastUpdated: { 
        type: Date, 
        default: Date.now 
    },
    parent: {
        collectionName: { type: String, required: true },
        id: { type: String, required: true, unique: true, dropDups: true },
        name: { type: mongoose.Schema.Types.Mixed, default: undefined }
    },
    links: {
        parent: { type: String, required: true },
        link: { type: String, required: true, unique: true },
        local: { type: String, required: true, unique: true }
    }
});

// Static method to create a new recovery document
UnlockSchema.statics.register = function (user) {
    var documentId = mongoose.Types.ObjectId();
    var recoveryDoc = new this({
        _id: documentId,
        parent: {
            id: user.id,
            collectionName: user.__t,
            name: user.name
        },
        links: {
            parent: user.links.local,
            link: config.service.domain + "recover-account/" + documentId,
            local: "/recover-account/" + documentId
        }
    });
    return recoveryDoc;
};

// Set `versionKey` to false to match the original behavior
UnlockSchema.set('versionKey', false);

// Middleware to update `lastUpdated` field before saving
UnlockSchema.pre('save', function (next) {
    this.lastUpdated = Date.now();
    next();
});

// Middleware for handling actions before document removal
UnlockSchema.pre('remove', function (next) {
    console.log('Account recovery document is being removed.');
    next();
});

module.exports = mongoose.model('UnlockAccount', UnlockSchema);
