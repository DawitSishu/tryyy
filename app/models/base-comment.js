'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var BaseCommentSchema = new Schema({
    dateAdded: { 
        type: Date, 
        default: Date.now 
    },
    lastUpdated: { 
        type: Date, 
        default: Date.now 
    },
    parent: {
        collectionName: { 
            type: String, 
            required: true 
        },
        id: { 
            type: String, 
            required: true 
        }
    },
    body: { 
        type: String, 
        required: true 
    },
    links: {
        parent: { 
            type: String, 
            required: true 
        }
    }
});

module.exports = mongoose.model('BaseComment', BaseCommentSchema);
