'use strict';

var formidable = require('formidable');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var config = require('../../config/config');

// Define the FakeSchema directly
var FakeSchema = new Schema({
    dateAdded: { 
        type: Number,  
        default: Date.now 
    }, // Join date
    lastUpdated: { 
        type: Number,  
        default: Date.now 
    }, // Last seen
    links: {
        link: { 
            type: String, 
            default: config.service.domain + "404" 
        }, // point to 404 page
        local: { 
            type: String, 
            default: "/404" 
        },
        avatar: { 
            type: String, 
            default: "/404" 
        }
    }
});

// Instance methods
FakeSchema.methods.addComment = function(id) { 
    return id; 
};

FakeSchema.methods.deleteComment = function(id) { 
    return id; 
};

FakeSchema.methods.removeComment = function(id) { 
    return id; 
};

FakeSchema.methods.deleteFile = function(id) { 
    return id; 
};

FakeSchema.methods.addNotification = function(id) {
    // Intentionally left empty
};

// Static methods
FakeSchema.statics.generateDoc = function() {
    var document = {
        _id: mongoose.Types.ObjectId().toString(),
        __t: 'FakeModel',
        displaySettings: {
            link: "http://localhost/3000/cool"
        },
        // Methods
        addComment: function(id) { return id; },
        deleteComment: function(id) { return id; },
        removeComment: function(id) { return id; },
        deleteFile: function(id) { return id; },
        addNotification: function(id) {
            // Intentionally left empty
        }
    };
    return document;
};

FakeSchema.set('versionKey', false);

// Middleware to update `lastUpdated` before saving
FakeSchema.pre('save', function(next) {
    this.lastUpdated = Date.now();
    next();
});

FakeSchema.pre('remove', function(next) {
    next();
});

module.exports = mongoose.model('FakeModel', FakeSchema);
