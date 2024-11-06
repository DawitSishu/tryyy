'use strict';

var formidable = require('formidable');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var async = require('async');
var mongoosePaginate = require('mongoose-paginate');

var config = require('../../config/config');
var asyncRemove = require('../helpers/async-remove');

var NotificationSchema = new Schema({
    dateAdded: { type: Number, default: Date.now }, // Join date
    lastUpdated: { type: Number, default: Date.now }, // Last seen
    parent: { // Entity being notified
        collectionName: { type: String, required: true }, // collection
        id: { type: String, required: true } // id
    },
    event: { // Event that warranted a notification
        collectionName: { type: String, required: true }, // collection
        id: { type: String, required: true } // id
    },
    title: { type: String, required: true },
    links: {
        link: { type: String, required: true }, // Link to the event
        local: { type: String, required: true } // Local link to the event
    },
    read: { type: Boolean, default: false }
});

NotificationSchema.plugin(mongoosePaginate);

// Static methods
NotificationSchema.statics.register = function(parent, event, title) {
    var note = new this({
        parent: {
            id: (parent.parent || parent).id || parent._id,
            collectionName: (parent.parent || parent).collectionName || parent.__t
        },
        event: {
            id: event._id,
            collectionName: event.__t
        },
        title: title,
        links: {
            link: event.links.link,
            local: event.links.local
        }
    });
    return note;
};

// Middleware to update dates
NotificationSchema.pre('save', function(next) {
    var note = this;
    note.lastUpdated = Date.now();

    if (note.isNew) {
        var parentCollection = mongoose.model(note.parent.collectionName);
        parentCollection.findOne({ _id: note.parent.id }, function(err, doc) {
            if (err || !doc) return next(err || new Error('Parent document not found'));
            doc.addNotification(note._id);
            doc.markModified("notifications");
            doc.save(next);
        });
    } else {
        next();
    }
});

// Middleware to handle deletion
NotificationSchema.pre('remove', function(next) {
    var note = this;
    var parentCollection = mongoose.model(note.parent.collectionName);

    function deleteFrom(collection, searchQuery, callback) {
        collection.findOne({ _id: searchQuery }, function(err, doc) {
            if (err) return callback(err);
            if (!doc) return callback(null);
            doc.deleteNotification(note._id);
            doc.save(callback);
        });
    }

    async.parallel([
        function(parellelCB) {
            deleteFrom(parentCollection, note.parent.id, parellelCB);
        }
    ], next);
});

module.exports = mongoose.model('Notification', NotificationSchema);
